import store from "../db/store.js";

// Configuration constants - these values will be refreshed when needed
let MAIN_MODEL = store.getSetting('mainModelName', 'gpt-4.1');
let AUX_MODEL = 'gpt-4.1-mini';
let LLM_PROVIDER = 'openai';

/**
 * Refreshes all LLM settings from the store
 * Call this function whenever settings have been updated
 */
function refreshLLMSettings() {
    MAIN_MODEL = store.getSetting('mainModelName', 'gpt-4.1');
    // For now AUX_MODEL is fixed, but we could make it configurable too
    // AUX_MODEL = store.getSetting('auxModelName', 'gpt-4.1-mini');
    LLM_PROVIDER = store.getSetting('mainModelProvider', 'openai');
    console.log(`LLM settings refreshed: provider=${LLM_PROVIDER}, main model=${MAIN_MODEL}`);
    return { MAIN_MODEL, AUX_MODEL, LLM_PROVIDER };
}

/**
 * Ensure model names follow provider's convention
 */
function sanitizeModelName(model) {
    if (model.startsWith('openai/')) {
        return model.replace('openai/', '');
    }
    return model;
}

export { MAIN_MODEL, AUX_MODEL, LLM_PROVIDER, refreshLLMSettings, sanitizeModelName };