// src/middleware/providers/ollama.js
//
// Minimal wrapper for Ollama’s REST API (/api/chat).
// Converts OpenAI-style options ⇄ Ollama format and vice-versa.

import fetch from 'node-fetch';                    // Node ≤18 — comment out if global fetch exists.

/* ───────────────────────── Adapt helpers ───────────────────────── */
function openaiToOllamaMessages(messages = []) {
    return messages.map(m => {
        // Convert OpenAI image-array format to Ollama’s { content, images }
        if (Array.isArray(m.content)) {
            const textParts   = [];
            const imageB64Arr = [];
            for (const p of m.content) {
                if (p.type === 'text')       textParts.push(p.text);
                if (p.type === 'image_url')  imageB64Arr.push(
                    p.image_url.url.replace(/^data:image\/[a-z]+;base64,/, '')
                );
            }
            return {
                ...m,
                content: textParts.join(''),
                images : imageB64Arr.length ? imageB64Arr : undefined,
            };
        }
        return m; // plain-string content, passthrough
    });
}

function processOptions(options = {}) {
    const body = {
        model    : options.model,
        messages : openaiToOllamaMessages(options.messages),
        stream   : Boolean(options.stream),
    };

    if (Array.isArray(options.tools) && options.tools.length) {
        body.tools = options.tools;                     // shape already matches Ollama
    }

    // Map temp / max_tokens → options.temperature / num_predict
    const modelOpts = {};
    if (options.temperature !== undefined) modelOpts.temperature  = options.temperature;
    if (options.max_tokens  !== undefined) modelOpts.num_predict   = options.max_tokens;
    // provide a sensible default if caller omitted max_tokens
    if (options.max_tokens === undefined && !options.stream) modelOpts.num_predict = 2048;

    if (Object.keys(modelOpts).length) body.options = modelOpts;

    return body;
}

function processResponse(raw) {
    // raw = final JSON object from /api/chat (non-stream)
    const created = Math.floor(new Date(raw.created_at).getTime() / 1000);

    // Re-shape assistant message back to OpenAI
    const assistantMsg = {
        role   : raw.message.role      ?? 'assistant',
        content: raw.message.content   ?? '',
    };

    if (raw.message.tool_calls?.length) assistantMsg.tool_calls = raw.message.tool_calls;

    if (raw.message.images?.length) {
        assistantMsg.content = [
            { type: 'text', text: raw.message.content ?? '' },
            ...raw.message.images.map(b64 => ({
                type      : 'image_url',
                image_url : { url: `data:image/jpeg;base64,${b64}` },
            })),
        ];
    }

    const usage = raw.prompt_eval_count != null ? {
        prompt_tokens     : raw.prompt_eval_count,
        completion_tokens : raw.eval_count,
        total_tokens      : raw.prompt_eval_count + raw.eval_count,
    } : undefined;

    return {
        id                : `ollama-${created}`,
        object            : 'chat.completion',
        created,
        model             : raw.model,
        choices           : [{
            index          : 0,
            message        : assistantMsg,
            finish_reason  : raw.done_reason ?? (raw.done ? 'stop' : null),
            logprobs       : null,
        }],
        usage,
        system_fingerprint: null,
    };
}

/* ───────────────────────── Provider ───────────────────────── */
export default {
    name: 'ollama',
    settings: ['apiKey', 'apiUrl'],
    /**
     * POST /api/chat
     * providerOptions:
     *   { apiUrl?: 'http://localhost:11434', timeout?: number }
     */
    async chat(options, providerOptions = {}) {
        const base   = providerOptions.url?.replace(/\/+$/, '') || 'http://localhost:11434';
        const url    = `${base}/api/chat`;
        const body   = processOptions(options);

        const res = await fetch(url, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(body),
            signal : options.signal,
        });

        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`ollama: ${res.status} ${res.statusText} — ${txt}`);
        }

        // Streaming not implemented; we force "stream": false in processOptions when caller omitted it.
        const data = await res.json();
        return processResponse(data);
    },
};
