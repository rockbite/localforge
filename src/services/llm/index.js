import OpenAI from 'openai';
import { SETTINGS_SCHEMA } from "../../routes/settingsRoutes.js";
import store from "../../db/store.js";
import openai from "../../middleware/openai.js";
import { MAIN_MODEL, AUX_MODEL, LLM_PROVIDER, refreshLLMSettings, sanitizeModelName } from "../../config/llm.js";

/**
 * Processes a message to make it compatible with the LLM API
 * Specifically converts tool use arrays to string format
 * @param {Object} message - The message to process
 * @returns {Object} - Processed message
 */
function preprocessMessageForLLM(message) {
    // Make a deep clone to avoid modifying the original
    const processedMessage = JSON.parse(JSON.stringify(message));
    
    // Handle tool_use format (assistant messages with array content)
    if (processedMessage.role === 'assistant' && 
        Array.isArray(processedMessage.content) && 
        processedMessage.content.length > 0 && 
        processedMessage.content[0].type === 'tool_use') {
        
        // Convert array of tool uses to a human-readable string
        const toolCalls = processedMessage.content.map(toolUse => {
            const toolName = toolUse.name || 'unknown';
            const input = JSON.stringify(toolUse.input || {}, null, 2);
            return `Called tool ${toolName} with arguments:\n${input}`;
        });
        
        // Join multiple tool calls with separators
        processedMessage.content = toolCalls.join('\n\n');
    }
    
    // Handle tool result format (user messages with TOOL_RESULT prefix)
    if (processedMessage.role === 'user' && 
        typeof processedMessage.content === 'string' && 
        processedMessage.content.startsWith('```TOOL_RESULT')) {
        
        // Extract the tool call ID and result
        const resultMatch = processedMessage.content.match(/Tool result for (.+?):\n(.+)/s);
        if (resultMatch && resultMatch.length >= 3) {
            const toolCallId = resultMatch[1];
            let toolResult = resultMatch[2];
            
            // Try to parse the result as JSON for better formatting
            try {
                const resultObj = JSON.parse(toolResult);
                toolResult = JSON.stringify(resultObj, null, 2);
            } catch (e) {
                // If not valid JSON, use as is
            }
            
            processedMessage.content = `Tool ${toolCallId} returned result:\n${toolResult}`;
        }
    }
    
    return processedMessage;
}

/**
 * Calls the selected LLM provider API with specified parameters
 * @param {Object} params - Parameters for the API call
 * @param {string} params.modelName - Model to use
 * @param {Array} params.messages - Array of message objects
 * @param {boolean} params.stream - Whether to stream the response
 * @param {number} params.temperature - Temperature parameter (0-2)
 * @param {number} params.max_tokens - Maximum tokens to generate
 * @param {Array} params.tools - Tools available to the model
 * @param {string} params.tool_choice - Optional tool choice strategy
 * @param {Function} params.responseCallback - Callback for streaming responses
 * @param {string} params.provider - Override the default provider
 * @returns {Promise<Object>} - Response from the API
 */
async function callLLM({ 
    modelName, 
    messages, 
    stream = false, 
    temperature = 1.0, 
    max_tokens = 16384, 
    tools = null, 
    tool_choice = null,
    responseCallback = null,
    provider = null,
    sessionId = null,
    signal = null // Add signal parameter
}) {
    try {
        // Determine which provider to use (from parameter, environment variable, or default)
        const providerKey = provider || LLM_PROVIDER;
        
        // Get the middleware for the provider
        const middleware = openai;

        // Preprocess messages for LLM consumption
        const processedMessages = messages.map(message => preprocessMessageForLLM(message));
        
        //console.log(JSON.stringify(processedMessages));

        // Create a sanitized copy of passed parameters without any signal 
        // (to avoid errors when middleware doesn't support it)
        const sanitizedOptions = {
            modelName,
            messages: processedMessages,
            stream,
            temperature,
            max_tokens,
            tools,
            tool_choice,
            provider
        };
        
        // Check signal before preparing options
        if (signal?.aborted) {
            console.log(`Aborting callLLM before calling middleware.`);
            throw new Error('ABORT_ERR');
        }

        // Prepare parameters
        const apiOptions = {
            model: sanitizeModelName(modelName),
            messages: processedMessages,
            temperature,
            max_tokens,
            stream
            // Do not include signal here to avoid API errors
        };
        
        // Add tools if provided
        if (tools) {
            apiOptions.tools = tools;
            if (tool_choice) {
                apiOptions.tool_choice = tool_choice;
            }
        }
        
        // Call the middleware, passing signal and callback
        const completion = await middleware.callLLM(apiOptions, responseCallback, signal);
        
        // Check signal *after* call returns (important for non-streaming ignore)
        if (signal?.aborted) {
            console.log(`Aborting callLLM after middleware returned (ignoring result).`);
            throw new Error('ABORT_ERR');
        }
        
        // Track token usage if sessionId is provided
        if (sessionId) {
            const { estimateTokens } = await import('../agent/index.js');
            const { projectSessionManager } = await import('../sessions/index.js');
            
            // Get token counts either from API response or estimate them
            const promptTokens = completion?.usage?.prompt_tokens 
                ?? estimateTokens(JSON.stringify(messages));
            const completionTokens = completion?.usage?.completion_tokens 
                ?? estimateTokens(JSON.stringify(completion.content || ''));
            
            // Add usage to session accounting through the manager
            await projectSessionManager.addUsage(sessionId, modelName, promptTokens, completionTokens);
        }
        
        return completion;
        
    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'ABORT_ERR') {
            console.log(`callLLM caught abort signal.`);
            throw error; // Re-throw AbortError or our custom marker
        }
        console.error(`Error calling LLM API with model ${modelName}:`, error);
        return {
            role: 'assistant',
            content: `Error calling LLM API: ${error.message}`
        };
    }
}

export { callLLM, preprocessMessageForLLM };