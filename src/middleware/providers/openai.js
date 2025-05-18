// src/middleware/providers/openai.js

import OpenAI from "openai";

/** @type {LLMProvider} */

/**
 * expected options format:
 *
 * {
 *   "model": "modelname",
 *   "messages": [
 *     {
 *       "role": "system",
 *       "content": ""
 *     },
 *     {
 *       "role": "user",
 *       "content": [
 *         {
 *           "type": "text",
 *           "text": "Text"
 *         },
 *         {
 *           "type": "image_url",
 *           "image_url": {
 *             // always base64: "url": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD..."
 *           }
 *         }
 *       ]
 *     }
 *   ],
 *   "tools": [
 *     {
 *       "type": "function",
 *       "function": {
 *         "name": "name",
 *         "description": "description of the function",
 *         "parameters": {
 *           "type": "object",
 *           "properties": {
 *             "param_name": {
 *               "type": "string",
 *               "description": "description"
 *             }
 *           },
 *           "required": ["param_name"]
 *         }
 *       }
 *     }
 *   ],
 *   "tool_choice": "auto",
 *   "temperature": 0.7,
 *   "stream": false,
 *   "max_tokens": 1024,
 * }
 *
 */


/**
 * expected response format:
 *
 * {
 *   "id": "chatcmpl-abc123",
 *   "object": "chat.completion",
 *   "created": 1689377102,
 *   "model": "gpt-4-vision-preview",
 *   "choices": [
 *     {
 *       "index": 0,
 *       "message": {
 *         "role": "assistant",
 *         "content": "This is a photo of a cat sitting on a windowsill.",
 *         "tools": [
 *           {
 *             "id": "call_abc123",
 *             "type": "function",
 *             "function": {
 *               "name": "extract_face_info",
 *               "arguments": "{ \"face_id\": \"face_1\" }"
 *             }
 *           }
 *         ]
 *       },
 *       "finish_reason": "tool_calls" // or "stop", "length", "content_filter"
 *     }
 *   ],
 *   "usage": {
 *     "prompt_tokens": 1024,
 *     "completion_tokens": 105,
 *     "total_tokens": 1129
 *   },
 *   "system_fingerprint": "fp_xyz456"
 * }
 *
 */

function processOptions(options) {
    // our standard is already /v1/chat/completions so no change needed for openai.js provider
    return  options;
}

function processResponse(response) {
    // our standard is already /v1/chat/completions so no change needed for openai.js provider
    return response;
}

export default {
    name: 'openai',
    settings: ['apiKey', 'apiUrl'],

    /**
     * /v1/chat/completions
     * Azure OpenAI, DeepSeek, Groq Cloud, Anyscale Endpoints, Fireworks, Together, Mistral API, Perplexity, OpenRouter, etc.
     */
    async chat(options, providerOptions) {
        let init = { apiKey:  providerOptions.apiKey }
        if(providerOptions.url) {
            init.baseURL = providerOptions.url;
        }

        let client = new OpenAI(init);

        // this needs this weird api change for whoever knows why
        if (options.model === 'o4-mini' || options.model === 'o3') {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
            delete options.temperature;
        }

        let signal = options.signal;
        delete options.signal;

        const  res = await client.chat.completions.create(options, {
            signal: signal
        });

        options.signal = signal;

        return res;
    },
};
