// llm.js
import providers from './providers/index.js';
import store from "../db/store.js";

let MAIN_MODEL = 0;
let AUX_MODEL = 1;
let EXPERT_MODEL = 2;


export async function callLLMByType(modelType, options) {
    options.model = getModelNameByType(modelType);
    return callLLMProvider(numToStringModelConfigNameMap(modelType), options);
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
export async function callLLMProvider(providerName, options) {
    const modelConfig = store.getModelConfigFor(providerName);
    let providerType = modelConfig.provider.type;
    let providerOptions = modelConfig.provider.options;

    const provider = providers[providerType];

    // check our custom options
    if (options.signal?.aborted) {
        console.log(`Aborting callLLM before calling middleware.`);
        throw new Error('ABORT_ERR');
    }

    // cleanup and sanitize here
    if(options.signal) delete options.signal;
    if(options.sessionId) delete options.sessionId;
    if(options.responseCallback) delete options.responseCallback; // TODO: this whole signal and responseCallback is shade and need to be changed, probably wont work now


    //TODO: this is shade and should be looked at
    options.messages = options.messages.map(message => preprocessMessageForLLM(message));

    if (!provider) {
        throw new Error(`No provider registered for name "${providerName}"`);
    }

    try {
        const res = await provider.chat(options, providerOptions);

        const msg = res.choices[0].message;
        const out = {
            role: 'assistant',
            content: msg.tool_calls ? null : msg.content,
            tool_calls: msg.tool_calls ?? null,
        };

        // Track token usage if sessionId is provided
        if (options.sessionId) {
            // TODO: this is old code that i wouldn't just trust, needs checking
            const { estimateTokens } = await import('../agent/index.js');
            const { projectSessionManager } = await import('../sessions/index.js');

            // Get token counts either from API response or estimate them
            const promptTokens = res?.usage?.prompt_tokens
                ?? estimateTokens(JSON.stringify(options.messages));
            const completionTokens = res?.usage?.completion_tokens
                ?? estimateTokens(JSON.stringify(res.content || ''));

            // Add usage to session accounting through the manager
            await projectSessionManager.addUsage(options.sessionId, options.model, promptTokens, completionTokens);
        }

        return out;

    } catch (err) {
        console.error(`[llm] ${provider.name} failed:`, err.message);
        return { role: 'assistant', content: `OpenAI error: ${err.message}` };
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

export {
    MAIN_MODEL,
    AUX_MODEL,
    EXPERT_MODEL,
    providers,
};