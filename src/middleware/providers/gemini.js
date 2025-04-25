// src/middleware/providers/gemini.js


import {
    GoogleGenAI,
    Type
} from '@google/genai';

/* ───────────────── helpers ───────────────── */
const toGeminiType = t => {
    switch ((t || '').toLowerCase()) {
        case 'object':  return Type.OBJECT;
        case 'string':  return Type.STRING;
        case 'number':  return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
        case 'array':   return Type.ARRAY;
        default:        return Type.STRING;
    }
};

const sanitizeSchema = s => {
    if (!s || typeof s !== 'object') return s;

    const clean = {
        type: toGeminiType(s.type),
        description: s.description,
    };

    if (s.properties) {
        clean.properties = Object.fromEntries(
            Object.entries(s.properties).map(([k, v]) => [k, sanitizeSchema(v)]),
        );
    }
    if (s.items) clean.items = sanitizeSchema(s.items);   // array item schema

    // note: deliberately dropping `required`, `additionalProperties`, etc.
    return clean;
};

/* ────────────────────────── Helpers ────────────────────────── */
function processOptions(options) {

    let config = {
        thinkingConfig: {
            thinkingBudget: 2048,
        },
        responseMimeType: 'text/plain',
    };

    // TODO: think of a better way to do this
    if(options.model.indexOf('flash') > 0) {
        delete config.thinkingConfig;
    }

    let messages = options.messages;


    // Convert OpenAI-style `options.tools` → Gemini-style `config.tools`
    if (Array.isArray(options.tools) && options.tools.length) {
        const functionDeclarations = options.tools
            .filter(t => t.type === 'function' && t.function)
            .map(({ function: fn }) => ({
                name:        fn.name,
                description: fn.description || '',
                parameters:  sanitizeSchema(fn.parameters),
            }));

        config.tools = functionDeclarations.length
            ? [{ functionDeclarations }]
            : undefined;
    }

    let contents = openaiToGeminiMessages(messages);

    if(contents.length > 0) {
        if(contents[0].role === 'system') {
            let systemText = contents[0].parts[0].text;
            contents = contents.slice(1);

            config.systemInstruction = [
                {
                    text: systemText,
                }
            ];
        }
    }

    if(options.temperature) config.temperature = options.temperature;
    if(options.max_tokens) config.maxOutputTokens = options.max_tokens;

    return { config, contents };
}



function openaiToGeminiMessages(messages) {
    const idToName = {};
    for (const m of messages) {
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const c of m.tool_calls) idToName[c.id] = c.function?.name;
        }
    }

    return messages.map(m => {
        const role =
            m.role === 'assistant' ? 'model' :
                m.role === 'tool'      ? 'function' :
                    m.role; // user / system

        const parts = [];

        /* ---------- assistant → functionCall ---------- */
        if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
            for (const c of m.tool_calls) {
                parts.push({
                    functionCall: {
                        name: c.function.name,
                        args: c.function.arguments
                            ? JSON.parse(c.function.arguments)
                            : {}
                    }
                });
            }
            return { role, parts };          // nothing else belongs here
        }

        /* ---------- tool → functionResponse ----------- */
        if (m.role === 'tool') {
            let data;
            try { data = JSON.parse(m.content); } catch { data = m.content; }
            parts.push({
                functionResponse: {
                    name: idToName[m.tool_call_id] || 'unknown',
                    response: data
                }
            });
            return { role, parts };          // ⬅️  EXIT: skip text branch
        }

        /* ---------- normal text / images -------------- */
        if (typeof m.content === 'string' && m.content.trim()) {
            parts.push({ text: m.content });
        } else if (Array.isArray(m.content)) {
            for (const p of m.content) {
                if (p.type === 'text') parts.push({ text: p.text });
                if (p.type === 'image_url') {
                    parts.push({
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: p.image_url.url.replace(
                                /^data:image\/[a-z]+;base64,/,
                                ''
                            )
                        }
                    });
                }
            }
        }

        return { role, parts };
    });
}


// Convert a Gemini response (either the SDK wrapper or raw JSON)
// into the OpenAI chat-completion JSON shape.
function processResponse(res) {
    const raw     = res.response ?? res;           // SDK wraps payload in .response
    const created = Math.floor(Date.now() / 1000); // OpenAI uses seconds

    /* ─────────────────────────────  Choices  ───────────────────────────── */
    const choices = (raw.candidates ?? []).map((c, cIdx) => {
        const parts      = c.content?.parts ?? [];
        const textChunks = [];
        const toolCalls  = [];

        parts.forEach((p, pIdx) => {
            if (p.text !== undefined) {
                textChunks.push(p.text);
            } else if (p.functionCall) {
                // Gemini puts function calls *inside* parts; OpenAI expects them in message.tool_calls
                toolCalls.push({
                    id: `call_${cIdx}_${pIdx}`,             // fabricate a stable id
                    type: 'function',
                    function: {
                        name: p.functionCall.name,
                        arguments: p.functionCall.argsJson ?? '{}',
                    },
                });
            }
            // ignore inlineData, toolResponses, etc. (not part of OpenAI schema)
        });

        // Build the assistant message
        const message = {
            role: 'assistant',
            content: textChunks.join(''),
        };
        if (toolCalls.length) message.tool_calls = toolCalls;

        // Gemini finish reasons are upper-case; normalise + translate a couple
        const finishMap = { STOP: 'stop', MAX_TOKENS: 'length', SAFETY: 'content_filter' };
        let finish_reason = finishMap[c.finishReason] ?? (c.finishReason?.toLowerCase() ?? 'stop');

        if(toolCalls.length > 0) {
            finish_reason = 'tool_calls';
        }

        // todo: call id was 0_0 for gemini, need to investiagate

        if(message.content === "") {
            message.content = null;
        }
        message.refusal = null;

        return {
            index: cIdx,
            message,
            finish_reason,
            logprobs: null, // Gemini doesn't return logprobs
        };
    });

    /* ─────────────────────────────  Usage  ───────────────────────────── */
    const usageMeta = raw.usageMetadata ?? {};
    const usage = usageMeta.promptTokenCount != null ? {
        prompt_tokens:      usageMeta.promptTokenCount,
        completion_tokens:  usageMeta.candidatesTokenCount,
        total_tokens:       usageMeta.totalTokenCount,
    } : undefined;

    /* ─────────────────────────────  Final envelope  ───────────────────────────── */
    return {
        id: raw.requestId ?? `gemini-${created}`,
        object: 'chat.completion',
        created,
        model: raw.model ?? raw.modelVersion ?? 'gemini',
        choices,
        usage,
        system_fingerprint: raw.systemFingerprint,   // present in Enterprise endpoints
    };
}


/* ────────────────────────── Provider ────────────────────────── */
export default {
    name: 'gemini',

    async chat(options, providerOptions) {
        let model = options.model;

        const client = new GoogleGenAI({
            apiKey: providerOptions.apiKey,
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
