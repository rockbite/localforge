// llm.js
import providers from './providers/index.js';

/**
 * Central entry point.
 * @param {string} prompt
 * @param {object} opts  e.g. { model: 'gpt-4o-mini', temperature: 0.7 }
 */
export async function callLLMProvider(providerName, options) {
    const provider = providers[providerName];

    if (!provider) {
        throw new Error(`No provider registered for name "${providerName}"`);
    }

    try {
        const result = await provider.chat(options);
        return result.text;
    } catch (err) {
        console.error(`[llm] ${provider.name} failed:`, err.message);
        throw err;
    }
}
