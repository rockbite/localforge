// src/middleware/providers/gemini.js

import {
    GoogleGenAI,
} from '@google/genai';
import store from '../../db/store.js';

/* ────────────────────────── Helpers ────────────────────────── */
function processOptions(options) {

    let config = {
        thinkingConfig: {
            thinkingBudget: 0,
        },
        responseMimeType: 'text/plain',
    };

    let messages = options.messages;


    if(options.tools) {
        config.tools =
            options.tools.length > 0
                ? [
                    {
                        functionDeclarations: options.tools
                            .filter((t) => t.type === 'function')
                            .map((t) => t.function),
                    },
                ]
                : undefined;
    }


    /* messages ➜ contents */
    const contents = messages.map((m) => {
        const role = m.role === 'assistant' ? 'model' : m.role;
        const parts = [];

        if (typeof m.content === 'string') {
            parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
            for (const part of m.content) {
                if (part.type === 'text') {
                    parts.push({ text: part.text });
                } else if (part.type === 'image_url') {
                    const b64 = part.image_url?.url.replace(/^data:image\/[a-z]+;base64,/, '');
                    parts.push({
                        inlineData: { mimeType: 'image/jpeg', data: b64 },
                    });
                }
            }
        }
        return { role, parts };
    });

    if(options.temperature) config.temperature = options.temperature;
    if(options.max_tokens) config.maxOutputTokens = options.max_tokens;

    return { config, contents };
}

function processResponse(res) {
    const raw = res.response ?? res; // SDK wraps raw reply in .response
    const created = Math.floor(Date.now() / 1000);
    const usage = raw.usageMetadata ?? {};

    const choices = (raw.candidates || []).map((c, i) => {
        const text = (c.content?.parts || [])
            .map((p) => p.text ?? '')
            .join('');

        const msg = {
            role: 'assistant',
            content: text,
        };

        /* tool calls (if any) */
        if (c.content?.toolCalls?.length) {
            msg.tool_calls = c.content.toolCalls.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: {
                    name: tc.name,
                    arguments: JSON.stringify(tc.args ?? {}),
                },
            }));
        }

        return {
            index: i,
            message: msg,
            finish_reason: c.finishReason ?? 'stop',
        };
    });

    return {
        id: raw.requestId ?? `gemini-${created}`,
        object: 'chat.completion',
        created,
        model: raw.model ?? 'gemini',
        choices,
        usage: usage.promptTokenCount
            ? {
                prompt_tokens: usage.promptTokenCount,
                completion_tokens: usage.candidatesTokenCount,
                total_tokens: usage.totalTokenCount,
            }
            : undefined,
    };
}

/* ────────────────────────── Provider ────────────────────────── */
export default {
    name: 'gemini',

    async chat(options) {
        let model = options.model;

        const client = new GoogleGenAI({
            apiKey: store.getSetting('geminiApiKey'),
        });

        const { contents, config } = processOptions(options);

        const res = await client.models.generateContent({
            model,
            config,
            contents
        });

        return processResponse(res);
    },
};
