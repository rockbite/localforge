// src/middleware/providers/anthropic.js
import Anthropic from '@anthropic-ai/sdk';

/* ───────────── Helpers ───────────── */

/** Map OpenAI-style messages to Anthropic Blocks */
function openaiToAnthropicMessages(messages = []) {
    return messages.map((m) => {
        // Claude only knows 'user' and 'assistant'.  Tool results are sent as user.
        let role = m.role === 'tool' ? 'user' : m.role;

        const content = [];

        /* assistant → tool_use */
        if (role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length) {
            if (m.content && typeof m.content === 'string' && m.content.trim()) {
                content.push({ type: 'text', text: m.content });
            }
            m.tool_calls.forEach((c) => {
                let args = {};
                try { args = JSON.parse(c.function.arguments ?? '{}'); } catch {}
                content.push({
                    type: 'tool_use',
                    id:   c.id,
                    name: c.function.name,
                    input: args,
                });
            });
            return { role, content };
        }

        /* tool result → tool_result */
        if (m.role === 'tool') {
            content.push({
                type: 'tool_result',
                tool_use_id: m.tool_call_id,
                content: m.content,
            });
            return { role, content };
        }

        /* normal text / images */
        if (typeof m.content === 'string') {
            content.push({ type: 'text', text: m.content });
        } else if (Array.isArray(m.content)) {
            m.content.forEach((p) => {
                if (p.type === 'text') {
                    content.push({ type: 'text', text: p.text });
                }
                if (p.type === 'image_url') {
                    content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/jpeg',
                            data: p.image_url.url.replace(/^data:image\/[a-z]+;base64,/, ''),
                        },
                    });
                }
            });
        }

        return { role, content };
    });
}

/** Build an Anthropic request body from OpenAI-style options */
function processOptions(opts = {}) {
    const body = { model: opts.model };

    // Pull out system prompt (if any)
    let msgs = opts.messages ?? [];
    if (msgs[0]?.role === 'system') {
        const sys = msgs.shift();
        body.system =
            typeof sys.content === 'string'
                ? sys.content
                : Array.isArray(sys.content)
                    ? sys.content.map((b) => b.text ?? '').join('')
                    : '';
    }

    body.messages = openaiToAnthropicMessages(msgs);

    if (opts.max_tokens)   {
        body.max_tokens   = opts.max_tokens;
    } else {
        body.max_tokens   = 20000; // default
    }
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.stream)       body.stream       = true;

    /* tools → tools */
    if (Array.isArray(opts.tools) && opts.tools.length) {
        body.tools = opts.tools
            .filter((t) => t.type === 'function' && t.function)
            .map(({ function: fn }) => ({
                name:         fn.name,
                description:  fn.description ?? '',
                input_schema: fn.parameters,
            }));
    }

    /* tool_choice */
    if (opts.tool_choice) {
        if (typeof opts.tool_choice === 'string') {
            body.tool_choice =
                opts.tool_choice === 'auto' ? { type: 'auto' } :
                    opts.tool_choice === 'none' ? { type: 'none' } :
                        opts.tool_choice === 'any'  ? { type: 'any'  } :
                            undefined;
        } else if (opts.tool_choice.name) {
            body.tool_choice = { type: 'tool', name: opts.tool_choice.name };
        }
    }

    return body;
}

/** Convert Anthropic response → OpenAI chat.completion envelope */
function processResponse(res) {
    const text = [];
    const toolCalls = [];
    (res.content ?? []).forEach((b) => {
        if (b.type === 'text')      text.push(b.text);
        if (b.type === 'tool_use') {
            toolCalls.push({
                id: b.id,
                type: 'function',
                function: {
                    name: b.name,
                    arguments: JSON.stringify(b.input ?? {}),
                },
            });
        }
    });

    const stopMap = {
        end_turn:     'stop',
        max_tokens:   'length',
        tool_use:     'tool_calls',
        stop_sequence:'stop',
    };

    return {
        id: res.id,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: res.model,
        choices: [
            {
                index: 0,
                message: {
                    role: 'assistant',
                    content: text.join('') || null,
                    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
                },
                finish_reason: stopMap[res.stop_reason] ?? 'stop',
                logprobs: null,
            },
        ],
        usage: res.usage
            ? {
                prompt_tokens:     res.usage.input_tokens,
                completion_tokens: res.usage.output_tokens,
                total_tokens:      res.usage.input_tokens + res.usage.output_tokens,
            }
            : undefined,
        system_fingerprint: null,
    };
}

/* ───────────── Provider ───────────── */
export default {
    name: 'anthropic',

    /**
     * /v1/messages
     */
    async chat(options, providerOptions = {}) {
        const client = new Anthropic({
            apiKey: providerOptions.apiKey,
            ...(providerOptions.apiUrl ? { baseURL: providerOptions.apiUrl } : {}),
        });

        const body = processOptions(options);

        // TODO: streaming passthrough; for now we swallow stream flag
        const res = await client.messages.create(body);
        return processResponse(res);
    },
};
