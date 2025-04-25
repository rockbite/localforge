import OpenAI from "openai";
import store from "../../db/store.js";

/** @type {LLMProvider} */
export default {
    name: 'openai',

    /**
     * /v1/chat/completions
     * Azure OpenAI, DeepSeek, Groq Cloud, Anyscale Endpoints, Fireworks, Together, Mistral API, Perplexity, OpenRouter, etc.
     */
    async chat(options) {
        let client = new OpenAI({ apiKey: store.getSetting('openaiApiKey') });

        if (options.model === 'o4-mini') {
            options.max_completion_tokens = options.max_tokens;
            delete options.max_tokens;
            delete options.temperature;
        }

        const res = await client.chat.completions.create(options);

        const msg = res.choices[0].message;
        return {
            text: msg.content,
            promptTokens: res.usage.prompt_tokens,
            completionTokens: res.usage.completion_tokens,
        };
    },
};