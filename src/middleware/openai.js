/**
 * openai.js
 *
 * Thin wrapper around the OpenAI SDK.
 *  – Keeps client initialisation (with hot-swappable key)
 *  – Exposes one async function: openaiChat()
 */

import OpenAI from 'openai';
import store from '../db/store.js';


/**
 * Fire a non-streaming chat completion and return the raw assistant message.
 * NOTE: this wrapper is **environment-agnostic** – it does *not* know about
 * AbortSignals, retries, accounting, etc.  Higher layers handle that.
 */
export async function llmChatCompletionsCall(options) {
    let client = new OpenAI({ apiKey: store.getSetting('openaiApiKey') });

    try {
        // One special-case: o4-mini → OpenAI’s tiny model shim
        if (options.model === 'o4-mini') {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
            delete options.temperature;
        }

        const res = await client.chat.completions.create(options);

        const msg = res.choices[0].message;
        const out = {
            role: 'assistant',
            content: msg.tool_calls ? null : msg.content, // todo: found it this is the bitch!!!
            tool_calls: msg.tool_calls ?? null,
        };

        if (res.usage) {
            out.usage = {
                prompt_tokens: res.usage.prompt_tokens,
                completion_tokens: res.usage.completion_tokens,
                total_tokens: res.usage.total_tokens,
            };
        }
        return out;
    } catch (err) {
        if (err.name === 'AbortError') throw err;          // bubble up clean aborts
        console.error('[openai] error:', err);
        return { role: 'assistant', content: `OpenAI error: ${err.message}` };
    }
}
