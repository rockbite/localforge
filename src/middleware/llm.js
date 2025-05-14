// llm.js
import providers from './providers/index.js';
import store from "../db/store.js";
import agentStore from "../db/agentStore.js";
import crypto from 'crypto';
import mcpService from "../services/mcp/index.js";

let MAIN_MODEL = 0;
let AUX_MODEL = 1;
let EXPERT_MODEL = 2;



export async function callLLMByType(modelType, options, sessionData = null) {

    options.model = getModelNameByType(modelType);
    let providerType = numToStringModelConfigNameMap(modelType);

    return callLLMProvider(providerType, options, sessionData);
}

function numToStringModelConfigNameMap(number) {
    if(number === EXPERT_MODEL) return `expert`;
    if(number === MAIN_MODEL) return `main`;
    return `aux`;
}

export function getProviderNameByType(modelType) {
    const config = store.getModelConfigFor(numToStringModelConfigNameMap(modelType));
    return config.provider.name;
}

export function getModelNameByType(modelType) {
    const config = store.getModelConfigFor(numToStringModelConfigNameMap(modelType));
    return config.model;
}

function getProviderTypeByProviderName(providerName) {

}


/**
 * Central entry point.
 * @param {string} prompt
 * @param {object} opts  e.g. { model: 'gpt-4o-mini', temperature: 0.7 }
 */
export async function callLLMProvider(providerName, options, sessionData = null) {
    const modelConfig = store.getModelConfigFor(providerName);
    let providerType = modelConfig.provider.type;
    let providerOptions = modelConfig.provider.options;
    let provider = providers[providerType];


    if(sessionData) {
        let agentId = sessionData.agentId;
        let agent = await agentStore.getAgent(agentId);
        if(agent && agent.agent) {
            agent = agent.agent;
            if(agent.llms[providerName]) {
                // we are overriding the default provider and model
                let providerListId = agent.llms[providerName].provider;
                let providerData = store.findProviderById(providerListId);
                if(providerData) {
                    let providerType = providerData.type;
                    provider = providers[providerType];
                    options.model = agent.llms[providerName].model;
                    providerOptions = providerData.options;
                }
            }
        }

        // now lets add MCP tools if any (check by alias)
        if(sessionData.mcpAlias) {
            const tools = await mcpService.listTools(sessionData.mcpAlias);
            patchBrokenTools(tools);
            if(tools && tools.length > 0) {
                options.tools.push(...tools);
            }
        }
    }


    // check our custom options
    if (options.signal?.aborted) {
        console.log(`Aborting callLLM before calling middleware.`);
        throw new Error('ABORT_ERR');
    }

    // Store params we'll need after the API call
    const sessionId = options.sessionId;
    const responseCallback = options.responseCallback;

    // Create a cleaned copy of options for the provider
    const cleanOptions = {...options};
    
    // Remove properties not expected by LLM providers
    // delete cleanOptions.signal; // todo this is wrong to remove here, some of them DO accept it
    delete cleanOptions.sessionId;
    delete cleanOptions.responseCallback;


    //TODO: this is shade and should be looked at
    cleanOptions.messages = options.messages.map(message => preprocessMessageForLLM(message));

    if (!provider) {
        throw new Error(`No provider registered for name "${providerName}"`);
    }

    try {

        preProcess(provider, cleanOptions);

        const res = await provider.chat(cleanOptions, providerOptions);

        const msg = res.choices[0].message;
        const out = {
            role: 'assistant',
            content: msg.content,
            tool_calls: msg.tool_calls ?? null,
        };

        postProcess(provider, cleanOptions, out);

        // Track token usage if sessionId is provided
        if (sessionId) {
            // TODO: this is old code that i wouldn't just trust, needs checking
            const { estimateTokens } = await import('../services/agent/index.js');
            const { projectSessionManager } = await import('../services/sessions/index.js');

            // Get token counts either from API response or estimate them
            const promptTokens = res?.usage?.prompt_tokens
                ?? estimateTokens(JSON.stringify(cleanOptions.messages));
            const completionTokens = res?.usage?.completion_tokens
                ?? estimateTokens(JSON.stringify(res.content || ''));

            // Add usage to session accounting through the manager
            await projectSessionManager.addUsage(sessionId, cleanOptions.model, promptTokens, completionTokens);
        }
        
        // Handle streaming updates if responseCallback is provided
        if (responseCallback && out.content) {
            responseCallback({
                content: out.content
            });
        }

        return out;

    } catch (err) {
        console.error(`[llm] ${provider.name} failed:`, err.message);
        return { role: 'assistant', content: `LLM error: ${err.message}` };
    }
}


/**
 * TODO: this method probably needs total removal and ditching, investigate later
 * @param message
 * @returns {any}
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

let postProcessMap = {"openai":{}};
let preProcessMap = {"openai":{}};


preProcessMap["openai"]["qwen3"] = function (provider, options) {
    // otherwise by default it drops too soon
    options.max_tokens = 200000;
}
/**
 * QWEN3 post processing to extract thinking and tool_calls (TODO, move this to separate patch files)
 * @param out
 */
postProcessMap["openai"]["qwen3"] = function (provider, options, out) {
    // ----- 1. normalise original text -----
    const originalContent = (typeof out.content === "string") ? out.content : "";
    let text = originalContent;           // will mutate to leave only plain text

    // ----- 2. <think> … </think> (stay consistent with old impl) -----
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    if (thinkMatch) {
        // you still have it if you ever need it:
        // const thinkContent = thinkMatch[1].trim();
        text = text.replace(thinkMatch[0], "");
    }

    // ----- 3. collect **all** <tool_call> blocks -----
    const toolBlocks = [];
    const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;  // global!
    let m;
    while ((m = toolCallRegex.exec(text)) !== null) {
        // m[1] is the inside of this tool_call block
        toolBlocks.push(m[1].trim());
    }
    // strip every block from plain text
    text = text.replace(toolCallRegex, "");

    // ----- 4. parse JSON lines from all blocks -----
    const allToolCalls = [];
    if (toolBlocks.length) {
        try {
            // explode each block into lines, keep non-empty, parse
            toolBlocks.forEach(block => {
                block.split(/\r?\n/)                   // handle both NL styles
                    .map(l => l.trim())
                    .filter(Boolean)
                    .forEach(line => {
                        const obj = JSON.parse(line);
                        allToolCalls.push(obj);
                    });
            });

            if (allToolCalls.length) {
                // wrap each parsed object into OpenAI-style envelope
                const uid = crypto.randomBytes(8).toString("hex");
                out.tool_calls = allToolCalls.map((o, i) => ({
                    id: `tool-call-${uid}-${i}`,
                    function: { name: o.name, arguments: o.arguments }
                }));
            } else {
                delete out.tool_calls;
            }
        } catch (err) {
            console.error("Failed to parse <tool_call> content:", err);
            delete out.tool_calls;
        }
    } else {
        delete out.tool_calls;
    }

    // ----- 5. update outbound text -----
    out.content = text.trim();
};

function preProcess(provider, options) {
    if(preProcessMap[provider.name]) {
        for(let idx in preProcessMap[provider.name]) {
            if(options.model.toLowerCase().includes(idx)) {
                preProcessMap[provider.name][idx](provider, options);
                return;
            }
        }
    }
}

function postProcess(provider, options, out) {
    if(postProcessMap[provider.name]) {
        for(let idx in postProcessMap[provider.name]) {
            if(options.model.toLowerCase().includes(idx)) {
                postProcessMap[provider.name][idx](provider, options, out);
                return;
            }
        }
    }
}


function patchBrokenTools(tools) {
    // Ensure tools is an array before trying to map over it
    for(let idx in tools) {
        let tool = tools[idx];
        if(tool?.function?.parameters?.type === 'object') {
            if(!tool.function.parameters.properties) {
                tool.function.parameters.properties = {};
            }
        }
    }
}


export {
    MAIN_MODEL,
    AUX_MODEL,
    EXPERT_MODEL,
    providers,
};