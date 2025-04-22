/**
 * OpenAI Middleware
 *
 * Handles API calls to OpenAI's models. This is the default middleware.
 */

import OpenAI from 'openai';
import { SETTINGS_SCHEMA } from "../routes/settingsRoutes.js";
import store from "../db/store.js";

// Function to create/refresh OpenAI client with latest settings
let openaiClient = null;

function refreshOpenAIClient() {
    openaiClient = new OpenAI({
        apiKey: store.getSetting('openaiApiKey'),
    });
    console.log('OpenAI client refreshed with latest API key');
    return openaiClient;
}

// Initialize the OpenAI client
const openai = refreshOpenAIClient();

// Model mappings (defaults for OpenAI are the same)
const MODEL_MAPPINGS = {
    'gpt-4-turbo': 'gpt-4-turbo',
    'gpt-4o-mini': 'gpt-4o-mini',
    'gpt-4': 'gpt-4',
    'gpt-3.5-turbo': 'gpt-3.5-turbo',
};

/**
 * System prompt overrides if needed
 * Each key should match a system prompt's first few words to identify it
 */
const SYSTEM_PROMPT_OVERRIDES = {
    // Example: 'You are a helpful assistant': 'You are a helpful OpenAI assistant',
};

/**
 * Applies any configured system prompt overrides
 */
function applySystemPromptOverrides(messages) {
    if (!messages || !messages.length) return messages;

    return messages.map(msg => {
        if (msg.role === 'system' && msg.content) {
            // Check if this system prompt matches any of our override keys
            for (const key in SYSTEM_PROMPT_OVERRIDES) {
                if (msg.content.startsWith(key)) {
                    return {
                        ...msg,
                        content: SYSTEM_PROMPT_OVERRIDES[key] || msg.content
                    };
                }
            }
        }
        return msg;
    });
}

/**
 * Maps the generic model name to the provider-specific model name
 */
function mapModelName(modelName) {
    return MODEL_MAPPINGS[modelName] || modelName;
}

/**
 * Call the OpenAI API
 */
async function callLLM(options, responseCallback = null, signal = null) {
    try {

        if(options.model ==='o4-mini') {
            // this is needed if we use o4-mini instead of gpt-4.1
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens; // Remove provider if present
            delete options.temperature; // Remove provider if present
        }

        // Always use the latest OpenAI client with current API key
        const client = openaiClient || refreshOpenAIClient();
        
        // Apply model mapping
        // Check signal before making API call
        if (signal?.aborted) {
            throw new Error('ABORT_ERR');
        }

        // Clone options to avoid modifying the original
        const apiOptions = {
            ...options,
            model: mapModelName(options.model),
            messages: applySystemPromptOverrides(options.messages)
        };
        
        // Remove signal from apiOptions - not supported by OpenAI API
        if (apiOptions.signal) {
            delete apiOptions.signal;
        }

        if (options.stream) {
            // Handle streaming response
            const streamResponse = await client.chat.completions.create(apiOptions);

            // Add listener to clean up stream if aborted externally
            const abortHandler = () => {
                console.log("Aborting OpenAI stream due to signal.");
                // OpenAI client should handle the abort via the passed signal
            };
            signal?.addEventListener('abort', abortHandler);

            let accumulatedContent = '';
            let accumulatedToolCalls = [];
            let currentToolCall = null;

            try {
                for await (const chunk of streamResponse) {
                    // Check signal inside the stream processing loop
                    if (signal?.aborted) {
                        console.log("Stream processing aborted.");
                        break; // Exit the loop
                    }
                const delta = chunk.choices[0]?.delta;

                // Handle tool calls in stream
                if (delta.tool_calls && delta.tool_calls.length > 0) {
                    const toolCall = delta.tool_calls[0];

                    if (toolCall.index === undefined) continue;

                    // Initialize or update current tool call
                    if (!currentToolCall || currentToolCall.index !== toolCall.index) {
                        if (currentToolCall) {
                            accumulatedToolCalls.push(currentToolCall);
                        }
                        currentToolCall = {
                            id: toolCall.id || `tool_call_${toolCall.index}`,
                            index: toolCall.index,
                            type: toolCall.type || 'function',
                            function: {
                                name: toolCall.function?.name || '',
                                arguments: toolCall.function?.arguments || ''
                            }
                        };
                    } else {
                        // Update existing tool call
                        if (toolCall.id) currentToolCall.id = toolCall.id;
                        if (toolCall.type) currentToolCall.type = toolCall.type;
                        if (toolCall.function?.name) currentToolCall.function.name = toolCall.function.name;
                        if (toolCall.function?.arguments) {
                            currentToolCall.function.arguments += toolCall.function.arguments;
                        }
                    }

                    // Call callback if provided
                    if (responseCallback) {
                        responseCallback({
                            type: 'tool_call_update',
                            tool_call: { ...currentToolCall }
                        });
                    }
                }

                // Handle regular content
                if (delta.content) {
                    accumulatedContent += delta.content;

                    // Call callback if provided
                    if (responseCallback) {
                        responseCallback({
                            type: 'content_update',
                            content: delta.content,
                            accumulated_content: accumulatedContent
                        });
                    }
                }

                // Handle completion
                if (chunk.choices[0]?.finish_reason) {
                    // Add the last tool call if it exists
                    if (currentToolCall) {
                        accumulatedToolCalls.push(currentToolCall);
                    }

                    // Call callback if provided
                    if (responseCallback) {
                        responseCallback({
                            type: 'completion',
                            finish_reason: chunk.choices[0].finish_reason
                        });
                    }
                }
                }
            } finally {
                // Remove listener on completion or break
                signal?.removeEventListener('abort', abortHandler);
            }

            // If loop was broken by abort, throw
            if (signal?.aborted) {
                throw new Error('ABORT_ERR');
            }

            // Return the accumulated response
            if (accumulatedToolCalls.length > 0) {
                return {
                    role: 'assistant',
                    content: null,
                    tool_calls: accumulatedToolCalls
                };
            } else {
                return {
                    role: 'assistant',
                    content: accumulatedContent
                };
            }
        } else {
            // Handle non-streaming response
            const completion = await client.chat.completions.create(apiOptions);
            
            // Check signal again after completion
            if (signal?.aborted) {
                console.log("OpenAI non-streaming call completed but aborted before processing.");
                throw new Error('ABORT_ERR');
            }
            
            const message = completion.choices[0].message;

            // Return the response
            // Build response object with token usage if available
            const response = {
                role: 'assistant',
                content: message.tool_calls ? null : message.content,
                tool_calls: message.tool_calls || null
            };

            // Include token usage information if available
            if (completion.usage) {
                response.usage = {
                    prompt_tokens: completion.usage.prompt_tokens,
                    completion_tokens: completion.usage.completion_tokens,
                    total_tokens: completion.usage.total_tokens
                };
            }

            return response;
        }
    } catch (error) {
        if (error.name === 'AbortError' || error.message === 'ABORT_ERR') {
            console.log(`OpenAI middleware caught abort signal.`);
            throw error; // Re-throw
        }
        console.error(`Error calling OpenAI API:`, error);
        return {
            role: 'assistant',
            content: `Error calling OpenAI API: ${error.message}`
        };
    }
}

export {
    callLLM,
    mapModelName,
    applySystemPromptOverrides,
    MODEL_MAPPINGS,
    SYSTEM_PROMPT_OVERRIDES,
    refreshOpenAIClient
};

export default { callLLM, refreshOpenAIClient };