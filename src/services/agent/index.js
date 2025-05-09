//agent/index.js

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import util from 'util';
const execPromise = util.promisify(exec);
import ejs from 'ejs';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import ProjectSessionManager for session management
import { projectSessionManager, sessionAccountingEvents } from '../sessions/index.js';

// Import tool registry for metadata access
import { TOOL_REGISTRY } from '../../../tools/index.js';
import {AUX_MODEL, callLLMByType, MAIN_MODEL} from "../../middleware/llm.js";
import os from "os";
import agentStore from "../../db/agentStore.js";
import {getPromptOverride} from "../../utils.js";
import {generateImageDescription} from "../image/index.js";
import mcpService from "../mcp/index.js";

// Token count constants
const MAX_TOKENS = 1000000; // 1 million tokens maximum

// Load prompts from EJS templates
async function loadPrompt(templateName, data = null) {
    const templatePath = path.join(__dirname, '../../../prompts', `${templateName}.ejs`);
    try {
        const template = await fs.readFile(templatePath, 'utf8');
        if(data) {
            return ejs.render(template, data);
        } else {
            return template;
        }
    } catch (error) {
        console.error(`Error loading prompt template '${templateName}':`, error);
        throw error;
    }
}


// Load prompts at initialization time
let MAIN_SYSTEM_PROMPT = '';
let TOPIC_DETECTION_PROMPT = '';
let WHIMSICAL_GERUND_PROMPT = '';

// Initialize prompts - called when module is loaded
async function initializePrompts(config = {}) {
    try {
        // Default agent name is "Jeff" but can be overridden
        const agentName = config.agentName;
        
        MAIN_SYSTEM_PROMPT = await loadPrompt('main-system');
        TOPIC_DETECTION_PROMPT = await loadPrompt('topic-detection');
        WHIMSICAL_GERUND_PROMPT = await loadPrompt('whimsical-gerund');
        console.log(`Prompt templates loaded successfully for agent: ${agentName}`);
    } catch (error) {
        console.error('Failed to initialize prompts:', error);
        process.exit(2);
    }
}

// Initialize with default configuration
initializePrompts({agentName: "Jeff"}).then();

/**
 * Gets environment information for the context
 * @param {string} workDir - Working directory path
 */
async function getEnvironmentInfo(workDir) {
    const cwd = workDir || process.cwd();
    let isGitRepo = false;
    const today = new Date().toLocaleDateString();


    const tag   = os.platform();   // e.g. "darwin"
    const pretty = ({
        darwin : "macOS",
        win32  : "Windows",
        linux  : "Linux"
    }[tag]) || tag;
    let platform = pretty + ` (${tag}) ` + os.version(); // e.g. "macOS 12.6.1" or "Windows 10" or "Linux 5.4.0-42-generic"

    let nodeV = globalThis.process?.versions?.node ?? 'n/a'

    try {
        // Only check git status if directory is provided
        if (workDir) {
            await execPromise('git rev-parse --is-inside-work-tree', { cwd });
            isGitRepo = true;
        } else {
            isGitRepo = false;
        }
    } catch (error) {
        isGitRepo = false;
    }
    
    return `<env>
Working directory: ${workDir ? cwd : 'Not set'}
Is directory a git repo: ${isGitRepo ? 'Yes' : 'No'}
Platform: ${platform}
Today's date: ${today}
Node.js version: ${nodeV}
</env>`;
}

/**
 * Gets directory structure for context
 * @param {string} workDir - Working directory path
 */
async function getDirectoryStructure(workDir) {
    // If no directory is set, return a message indicating this
    if (!workDir) {
        return `<context name="directoryStructure">No working directory has been set. You won't be able to access files until the user sets a working directory.</context>`;
    }
    
    const cwd = workDir;
    let structure = "";
    
    try {
        const { stdout } = await execPromise('find . -type f -not -path "*/node_modules/*" -not -path "*/.git/*" | sort', { cwd });
        structure = stdout;
    } catch (error) {
        structure = "Error getting directory structure";
    }
    
    return `<context name="directoryStructure">Below is a snapshot of this project's file structure at the start of the conversation. This snapshot will NOT update during the conversation. It skips over .gitignore patterns.

- ${cwd}/
${structure.split('\n').map(line => `  ${line}`).join('\n')}
</context>`;
}

/**
 * Gets Git status for context
 * @param {string} workDir - Working directory path
 */
async function getGitStatus(workDir) {
    // If no directory is set, return a message indicating this
    if (!workDir) {
        return `<context name="gitStatus">No working directory has been set, so Git status information is not available.</context>`;
    }
    
    const cwd = workDir;
    let status = "";
    let branch = "";
    let commits = "";
    
    try {
        // Get current branch
        const { stdout: branchOut } = await execPromise('git rev-parse --abbrev-ref HEAD', { cwd });
        branch = branchOut.trim();
        
        // Get status
        const { stdout: statusOut } = await execPromise('git status --porcelain', { cwd });
        status = statusOut;
        
        // Get recent commits
        const { stdout: commitsOut } = await execPromise('git log -5 --oneline', { cwd });
        commits = commitsOut;
    } catch (error) {
        // Not a git repo or git error
        return `<context name="gitStatus">Not a git repository or git error: ${error.message}</context>`;
    }
    
    return `<context name="gitStatus">This is the git status at the start of the conversation. Note that this status is a snapshot in time, and will not update during the conversation.
Current branch: ${branch}

Main branch (you will usually use this for PRs): 

Status:
${status.length > 0 ? status : 'No changes'}

Recent commits:
${commits.length > 0 ? commits : 'No commits'}
</context>`;
}

/**
 * Estimates token count using a simple 4.91 chars per token estimation
 * @param {string} str - String to estimate tokens for
 * @returns {number} - Estimated token count
 */
function estimateTokens(str) {
    return Math.ceil((str || '').length / 4.91);
}

/**
 * Calculates the current token count from a history array
 * @param {Array} historyArray - Array of message objects
 * @returns {number} - Estimated token count
 */
function calculateCurrentTokensFromHistory(historyArray) {
    if (!Array.isArray(historyArray)) return 0;
    
    let totalTokens = 0;
    for (const message of historyArray) {
        // Handle potential variations in message structure (string vs object content)
        let contentString = '';
        if (typeof message.content === 'string') {
            contentString = message.content;
        } else if (Array.isArray(message.content)) { 
            // Handle two cases:
            // 1. Multimodal like [{type: 'text', text: '...'}, ...]
            // 2. Tool use like [{type: 'tool_use', id: '...', ...}]
            
            // Check if this is a tool use message
            if (message.content.length > 0 && message.content[0].type === 'tool_use') {
                // For tool use messages, we count the serialized JSON
                contentString = JSON.stringify(message.content);
            } else {
                // For multimodal, extract just the text parts
                contentString = message.content
                    .filter(p => p.type === 'text')
                    .map(p => p.text)
                    .join('\n');
            }
        }
        totalTokens += estimateTokens(contentString);

        // Add tokens for tool calls/responses (legacy format)
        if (message.tool_calls) {
            totalTokens += estimateTokens(JSON.stringify(message.tool_calls));
        }
        if (message.role === 'tool') {
            totalTokens += estimateTokens(message.content); // Tool results are often stringified JSON
        }
        
        // Check for tool result format in user messages
        if (message.role === 'user' && 
            typeof message.content === 'string' && 
            message.content.startsWith('```TOOL_RESULT')) {
            // These are tool results formatted as user messages
            totalTokens += estimateTokens(message.content);
        }
    }
    return totalTokens;
}

/**
 * Combines system prompt, environment info, and context
 * @param {string} workDir - Working directory path
 */
async function getSystemAndContext(workDir, sessionData = null) {
    const envInfo = await getEnvironmentInfo(workDir);

    //todo: this is outdated and deprecated
    //const dirStructure = await getDirectoryStructure(workDir);
    //const gitStatus = await getGitStatus(workDir);

    // todo, change it so that env info is injected and ejs parsed each time

    let promptText = MAIN_SYSTEM_PROMPT;

    promptText = await getPromptOverride(sessionData, "main-system", promptText);
    // render
    promptText = ejs.render(promptText, {agentName: "Jeff", envInfo: envInfo});

    let systemMessage = {
        role: 'system',
        content: `${promptText}`
    };
    
    return [systemMessage];
}

/**
 * Detects if a message indicates a new topic
 */
async function detectTopic(message) {
    try {
        const messages = [
            {
                role: 'system',
                content: TOPIC_DETECTION_PROMPT
            },
            {
                role: 'user',
                content: message
            }
        ];

        const response = await callLLMByType(AUX_MODEL, {
            messages,
            temperature: 0,
            max_tokens: 128
        });
        
        try {
            response.content = response.content?.trim() ?? '';
            response.content = response.content.startsWith("```json") && response.content.endsWith("```") ? response.content.slice(7, -3) : response.content;
            const result = JSON.parse(response.content);
            return result;
        } catch (error) {
            console.error('Error parsing topic detection response:', error);
            return { isNewTopic: false, title: null };
        }
    } catch (error) {
        console.error('Error in topic detection:', error);
        return { isNewTopic: false, title: null };
    }
}

/**
 * Generates a whimsical gerund related to a word
 */
async function generateGerund(word) {
    try {
        const messages = [
            {
                role: 'system',
                content: WHIMSICAL_GERUND_PROMPT
            },
            {
                role: 'user',
                content: word
            }
        ];

        const response = await callLLMByType(AUX_MODEL, {
            messages,
            temperature: 1.0,
            max_tokens: 32
        });
        
        return response.content.trim();
    } catch (error) {
        console.error('Error generating gerund:', error);
        return "Processing"; // Default fallback
    }
}

/**
 * Core agent loop function
 * @param {string} sessionId - Session ID 
 * @param {Array} currentMessages - Current message list for the LLM
 * @param {Object} agentTools - Object with getSchemas and run methods
 * @param {string} llmModel - LLM model to use
 * @param {string} workingDirectory - Working directory path
 * @param {Function} streamCallback - Optional callback for streaming updates
 * @param {AbortSignal} signal - Optional abort signal for interrupting execution
 * @returns {Object} - Final LLM message
 */
async function runAgentLoop(sessionId, currentMessages, agentTools, workingDirectory, streamCallback = null, signal = null) {
    console.log(`Starting agent loop with ${currentMessages.length} messages`);
    let loopMessages = [...currentMessages]; // Work on a copy

    // Check for interruption before starting the loop
    if (projectSessionManager.isInterruptionRequested(sessionId) || signal?.aborted) {
        console.log(`[${sessionId}] Interruption detected before starting agent loop.`);
        throw new Error('ABORT_ERR'); // Use a specific error or marker
    }

    while (true) {
        // Check for interruption before calling LLM
        if (projectSessionManager.isInterruptionRequested(sessionId) || signal?.aborted) {
            console.log(`[${sessionId}] Interruption detected before LLM call.`);
            throw new Error('ABORT_ERR');
        }
        
        // Call LLM with the current messages and available tools
        // Check if this is a sub-agent session (starts with "sub_")
        const isSubAgentSession = sessionId.startsWith('sub_');

        let sessionData = await projectSessionManager.getSession(sessionId); // todo: check if this is fast or not

        const llmResponse = await callLLMByType(MAIN_MODEL, {
            messages: loopMessages,
            tools: await agentTools.getSchemas(sessionData),
            sessionId: isSubAgentSession ? null : sessionId, // Only pass sessionId for main agents
            signal, // Pass the signal down
            responseCallback: streamCallback ? (update) => {
                // Check interruption during stream callback
                if (projectSessionManager.isInterruptionRequested(sessionId) || signal?.aborted) {
                    console.log(`[${sessionId}] Interruption detected during LLM stream update.`);
                    throw new Error('ABORT_ERR'); // Stop processing stream updates
                }

                // Forward streaming updates from LLM to the client
                streamCallback({
                    type: 'llm_update',
                    ...update
                });
            } : null
        }, sessionData).catch(error => {
            if (error.name === 'AbortError' || error.message === 'ABORT_ERR') {
                console.log(`[${sessionId}] LLM call aborted.`);
                throw new Error('ABORT_ERR'); // Re-throw standardized error
            }
            throw error; // Re-throw other errors
        });
        
        // Add LLM's response to the messages list
        loopMessages.push(llmResponse);

        // cleanup system-image if present
        cleanupLoopHistoryFromImageMessage(loopMessages);
        
        // Analyze the response - check if it has content, tool calls, or both
        const hasContent = llmResponse.content && llmResponse.content.trim().length > 0;
        const hasToolCalls = llmResponse.tool_calls && llmResponse.tool_calls.length > 0;

        console.log(JSON.stringify(streamCallback));

        // If response contains tool calls, execute them
        if (hasToolCalls) {
            console.log(`LLM requested ${llmResponse.tool_calls.length} tool calls`);
            
            // If we have both content and tool calls, handle content first

            let toolUseObject = {
                role: 'assistant',
                content: llmResponse.tool_calls.map(call => ({
                    type: 'tool_use',
                    id: call.id,
                    name: call.function.name,
                    input: typeof call.function.arguments === 'string'
                        ? JSON.parse(call.function.arguments)
                        : call.function.arguments
                }))
            };

            if (hasContent) {
                toolUseObject.content.push({type: 'text', text: llmResponse.content});
                // Notify frontend about interim content to display immediately
                if (streamCallback) {
                    streamCallback({
                        type: 'interim_content',
                        content: llmResponse.content,
                        tool_calls: llmResponse.tool_calls,
                        sessionId: sessionId // Include sessionId for proper session tracking
                    });
                }
            }
            
            // Then save tool_use message (only for main agents)
            if (!sessionId.startsWith('sub_')) {
                // Persist the tool use query in history (todo: this is wrong, we should persist what we put in loop), only change when image
                //await projectSessionManager.appendAssistantMessage(sessionId, toolUseObject);
                await projectSessionManager.appendAssistantMessage(sessionId, llmResponse); // append as is to history
            }
            
            if (streamCallback) {
                streamCallback({
                    type: 'tool_calls_received',
                    count: llmResponse.tool_calls.length
                });
            }
            
            // Process each tool call sequentially
            for (const call of llmResponse.tool_calls) {
                console.log(`Processing tool call: ${call.function.name}`);
                
                if (streamCallback) {
                    // Get the tool implementation from the registry
                    const toolImpl = TOOL_REGISTRY[call.function.name];
                    
                    // Parse arguments
                    const args = typeof call.function.arguments === 'string'
                        ? JSON.parse(call.function.arguments)
                        : call.function.arguments;
                    
                    // Update registry with sessionId
                    agentTools.sessionId = sessionId;

                    // Get the descriptive text if the method exists
                    let descriptiveText = null;
                    if (toolImpl && toolImpl.getDescriptiveText) {
                        try {
                            descriptiveText = toolImpl.getDescriptiveText(args);
                        } catch (err) {
                            console.error(`Error getting descriptive text for ${call.function.name}:`, err);
                        }
                    }
                    
                    // Only update session state for main agent sessions (not sub-agents)
                    if (!sessionId.startsWith('sub_')) {
                        // Set agent state to tool running
                        await projectSessionManager.setAgentState(sessionId, {
                            status: 'tool_running',
                            statusText: descriptiveText || `Running ${call.function.name}...`,
                            startTime: Date.now(),
                            activeToolCallId: call.id
                        });
                        
                        // Log tool start
                        await projectSessionManager.appendToolLog(sessionId, {
                            type: 'TOOL_START',
                            toolCallId: call.id,
                            toolName: call.function.name,
                            args: args,
                            descriptiveText: descriptiveText
                        });
                    }
                    
                    // Send update to frontend with the descriptive text
                    streamCallback({
                        type: 'tool_execution_start',
                        tool: call.function.name,
                        id: call.id,
                        args: call.function.arguments,
                        descriptiveText: descriptiveText
                    });
                }
                
                // Check for interruption before executing each tool
                if (projectSessionManager.isInterruptionRequested(sessionId) || signal?.aborted) {
                    console.log(`[${sessionId}] Interruption detected before executing tool: ${call.function.name}`);
                    throw new Error('ABORT_ERR');
                }

                // Run the tool using provided agent tools, passing the signal
                let result = await agentTools.run(call, sessionData, signal)
                    .catch(error => {
                        if (error.name === 'AbortError' || error.message === 'ABORT_ERR') {
                            console.log(`[${sessionId}] Tool execution aborted: ${call.function.name}`);
                            throw new Error('ABORT_ERR'); // Re-throw standardized error
                        }
                        // Handle non-abort errors from the tool gracefully
                        console.error(`[${sessionId}] Error executing tool ${call.function.name}:`, error);
                        return { error: `Tool execution failed: ${error.message}` }; // Return an error object instead of throwing
                    });
                console.log(`Tool execution completed for ${call.function.name}`);

                let toolResultObject = {
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(result)
                };
                // check if result is a string or an image object
                let wasImage = false;
                let imageData = null;
                if (typeof result === 'object') {
                    if(result.hasOwnProperty('image-base64') && result.hasOwnProperty('text')) {
                        toolResultObject.content = result.text;
                        // we'll take care of image later because of this flag
                        wasImage = true;
                        imageData = result['image-base64'];
                        result = result.text;
                    } else {
                        toolResultObject.content = JSON.stringify(result);
                    }
                } else {
                    toolResultObject.content = result;
                }
                // Add the tool result to the messages list
                loopMessages.push(toolResultObject);

                // but if it was an image we need to add temporary user message to delete it later, because tools cant carry multimodal data
                // system-image type contents must be cleaned up after sending from history
                if(wasImage) {
                    loopMessages.push( {
                        role: 'user',
                        content: [
                            {
                                type: "text",
                                text: "[system-image]"
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: imageData,
                                },
                            }
                        ]
                    })
                }
                
                // Persist the tool result message (only for main agents) //todo: here we need to append TOOL message not user message, just like openai requires it, not this garbage
                if (!sessionId.startsWith('sub_')) {
                    // Save the tool result in history with the TOOL_RESULT format
                    /*
                    await projectSessionManager.appendUserMessageOnly(sessionId, {
                        role: 'user',
                        content: `\`\`\`TOOL_RESULT: Tool result for ${call.id}:\n${JSON.stringify(result)}`
                    });
                     */
                    await projectSessionManager.appendUserMessageOnly(sessionId, {
                        role: 'tool',
                        tool_call_id: call.id,
                        content: JSON.stringify(result)
                    });
                }
                
                // Only update session state for main agent sessions (not sub-agents)
                if (!sessionId.startsWith('sub_')) {
                    // Log tool completion
                    await projectSessionManager.appendToolLog(sessionId, {
                        type: 'TOOL_END',
                        toolCallId: call.id,
                        toolName: call.function.name,
                        result: result
                    });
                    
                    // Check if this is the last tool in the current batch
                    const currentToolIndex = llmResponse.tool_calls.findIndex(tc => tc.id === call.id);
                    const isLastToolInBatch = currentToolIndex === llmResponse.tool_calls.length - 1;
                    
                    if (isLastToolInBatch) {
                        // If this was the last tool, set state back to thinking
                        await projectSessionManager.setAgentState(sessionId, {
                            status: 'thinking',
                            statusText: 'Processing tool results...',
                            startTime: Date.now(),
                            activeToolCallId: null
                        });
                    }
                }
                
                if (streamCallback) {
                    streamCallback({
                        type: 'tool_execution_complete',
                        tool: call.function.name,
                        id: call.id,
                        result: result
                    });
                }
            }
            
            if (streamCallback) {
                streamCallback({
                    type: 'all_tools_complete',
                    count: llmResponse.tool_calls.length
                });
            }
            
            // Check interruption after processing all tools in the batch
            if (projectSessionManager.isInterruptionRequested(sessionId) || signal?.aborted) {
                console.log(`[${sessionId}] Interruption detected after tool batch execution.`);
                throw new Error('ABORT_ERR');
            }
            
            // Continue the loop to get the next response after tool execution
            continue;
        } else {
            // If we have a standard text response, return it
            return llmResponse;
        }
    }
}


function cleanupLoopHistoryFromImageMessage(loopMessages) {
    for (let i = loopMessages.length - 1; i >= 0; i--) {
        const message = loopMessages[i];
        if(message.role === 'user' && message.content.length > 0) {
            if(message.content[0].type === "text" && message.content[0].text === "[system-image]") {
                loopMessages.splice(i, 1);
            }
        }
    }
}

/**
 * Main request handler function
 * @param {string} projectId - Project ID
 * @param {string} sessionId - Session ID
 * @param {Object} message - User message
 * @param {Function} streamCallback - Optional callback function for streaming updates
 * @returns {Object} - Response object
 */
async function handleRequest(projectId, sessionId, message, streamCallback = null) {
    const abortController = new AbortController();
    const signal = abortController.signal;

    console.log(streamCallback);

    // Listener to abort if interruption is requested via the manager
    const checkInterruption = () => {
        if (projectSessionManager.isInterruptionRequested(sessionId)) {
            console.log(`[${sessionId}] AbortController triggered by interruption flag.`);
            abortController.abort();
            // No need to constantly check after aborting
        } else {
            // Re-schedule check if not aborted yet
            setTimeout(checkInterruption, 250); // Check every 250ms
        }
    };
    // Start checking
    const checkIntervalId = setTimeout(checkInterruption, 250);

    try {
        // 0. Load session data using the manager
        const sessionData = await projectSessionManager.getSession(sessionId);
        const persistentHistory = sessionData.history || [];
        const workingDirectory = sessionData.workingDirectory;
        
        // Check immediately before starting major work
        if (projectSessionManager.isInterruptionRequested(sessionId) || signal.aborted) {
            await projectSessionManager.finalizeInterruption(sessionId);
            return { interrupted: true, sessionId };
        }
        
        // Set initial agent state to 'thinking'
        await projectSessionManager.setAgentState(sessionId, {
            status: 'thinking',
            statusText: 'Processing request...',
            startTime: Date.now(),
            activeToolCallId: null
        });

        // Emit existing accounting to UI if any
        if (sessionData.accounting && sessionData.accounting.totalUSD > 0 && streamCallback) {
            sessionAccountingEvents.emit('updated', {
                sessionId: sessionId,
                totalUSD: sessionData.accounting.totalUSD.toFixed(4),
                breakdown: sessionData.accounting.models
            });
        }

        // 1. Examine incoming message for text + image parts
        let userText = '';
        let userImageData = null;
        let originalImageName = 'image';

        if (Array.isArray(message.content)) {
            for (const part of message.content) {
                if (part.type === 'text') {
                    userText += part.text;
                } else if (part.type === 'image_url' && part.image_url && part.image_url.url) {
                    userImageData = part.image_url.url;
                    // Try to extract filename if url is not data URI
                    try {
                        const urlWithoutQuery = userImageData.split('?')[0];
                        originalImageName = urlWithoutQuery.substring(urlWithoutQuery.lastIndexOf('/') + 1) || 'image';
                    } catch (_) {
                        originalImageName = 'image';
                    }
                }
            }
        } else {
            userText = message.content || '';
        }

        // No need to store user message here - it's now handled in server.js before calling handleRequest
        // This prevents duplicate message persistence

        // 2. Spawn image description generation if needed (do NOT await yet)
        let imageDescriptionPromise = null;
        if (userImageData) {
            const { generateImageDescription } = await import('../image/index.js');
            imageDescriptionPromise = generateImageDescription(userImageData).catch(err => {
                console.error('Image description failed:', err);
                return '[[Error generating image description]]';
            });
        }

        // 3. Prepare system/context messages (common)
        const systemAndContextMessages = await getSystemAndContext(workingDirectory, sessionData);


        // 5. Topic detection & gerund (use text only, before description)
        const topicInfo = await detectTopic(userText);
        if (streamCallback) {
            streamCallback({ type: 'topic_detection', topic: topicInfo });
        }

        const firstWord = (userText.trim().split(/\s+/)[0]) || 'Processing';
        const gerund = await generateGerund(firstWord);
        if (streamCallback) {
            streamCallback({ type: 'gerund_generation', gerund });
        }
        
        // Only update agent state - don't log gerund as a tool log
        
        // Update agent state with the gerund
        await projectSessionManager.setAgentState(sessionId, {
            status: 'thinking',
            statusText: `${gerund}...`,
            startTime: Date.now(),
            activeToolCallId: null
        });

        // 6. Combine messages for LLM call
        //const messagesForLLM = systemAndContextMessages.concat(persistentHistory).concat(userMessageForLLM);
        const messagesForLLM = systemAndContextMessages.concat(persistentHistory);

        // 7. Prepare tools registry
        const { createToolRegistry, getAllToolNames } = await import('../../../tools/index.js');
        const agentTools = createToolRegistry(getAllToolNames());
        agentTools.sessionId = sessionId;

        // 8. Run the agent loop with the signal
        const finalAssistantMessage = await runAgentLoop(
            sessionId, 
            messagesForLLM, 
            agentTools,
            workingDirectory, 
            streamCallback,
            signal
        );

        // 9. Wait for image description (if needed) and update user message with description if needed
        if (imageDescriptionPromise) {
            if (streamCallback) {
                streamCallback({ type: 'image_description_wait' });
            }
            const description = await imageDescriptionPromise;
            const updatedUserContent = userText + `\n\n--- Attached Image: ${originalImageName} ---\n${description}`;
            
            // Update the previously stored user message with the image description
            await projectSessionManager.updateUserMessage(sessionId, updatedUserContent);
            
            if (streamCallback) {
                streamCallback({ type: 'image_description_ready', description });
            }
        }

        // 10. Append assistant response to history (only for main agents, not sub-agents)
        // Only append the message if it's a content-only message without tool calls
        // Messages with tool calls are already persisted within the runAgentLoop
        if (!sessionId.startsWith('sub_') && finalAssistantMessage.content && !finalAssistantMessage.tool_calls) {
            console.log(`[${sessionId}] Persisting final content-only assistant message.`);
            await projectSessionManager.appendAssistantMessage(sessionId, finalAssistantMessage);
        } else if (!sessionId.startsWith('sub_')) {
            console.log(`[${sessionId}] Skipping final persistence - message likely involved tools (already persisted) or was empty.`);
        }
        
        // Set agent state back to idle (only for main agents, not sub-agents)
        if (!sessionId.startsWith('sub_')) {
            await projectSessionManager.setAgentState(sessionId, {
                status: 'idle',
                statusText: null,
                startTime: null,
                activeToolCallId: null
            });
        }

        // 11. Update token counts (calculate from the final history - only for main agents)
        let updatedTokenCount = 0;
        if (!sessionId.startsWith('sub_')) {
            let sess = await projectSessionManager.getSession(sessionId);
            // this was depricated code, leaving for short term
            //const finalHistory = sess?.history || [];
            //updatedTokenCount = calculateCurrentTokensFromHistory(finalHistory);
            updatedTokenCount = sess.accounting.input + sess.accounting.output;
            if (streamCallback) {
                streamCallback({ type: 'token_count', current: updatedTokenCount, max: MAX_TOKENS });
            }
        }

        // 12. Prepare response
        const response = {
            message: finalAssistantMessage,
            sessionId,
            tokenCount: updatedTokenCount,
            maxTokens: MAX_TOKENS
        };

        if (streamCallback) {
            streamCallback({ type: 'final_response', response });
        }

        return response;
    } catch (error) {
        // Centralized interruption handling
        if (error.message === 'ABORT_ERR' || error.name === 'AbortError') {
            console.log(`[${sessionId}] handleRequest caught interruption signal.`);
            await projectSessionManager.finalizeInterruption(sessionId);
            // Notify client via streamCallback or directly if needed
            if (streamCallback) {
                streamCallback({ type: 'interrupt_complete', sessionId });
            }
            return { interrupted: true, sessionId }; // Indicate interruption happened
        } else {
            // Handle other errors
            console.error(`Error handling request for session ${sessionId}:`, error);
            // Attempt to set state to idle even on error
            try {
                await projectSessionManager.setAgentState(sessionId, { status: 'idle' });
            } catch (stateError) {
                console.error(`[${sessionId}] Failed to set idle state after error:`, stateError);
            }
            if (streamCallback) {
                streamCallback({ 
                    type: 'error', 
                    error: { message: error.message || 'Failed to process request' } 
                });
            }
            throw error;
        }
    } finally {
        // Clean up the interruption check interval
        clearTimeout(checkIntervalId);
        // Ensure the interruption flag is cleared if handleRequest exits for any reason
        projectSessionManager.clearInterruption(sessionId);
    }
}

export { 
    handleRequest, 
    runAgentLoop,
    getEnvironmentInfo,
    getDirectoryStructure,
    initializePrompts,
    estimateTokens,
    calculateCurrentTokensFromHistory,
    detectTopic,
    generateGerund,
    getSystemAndContext
};