import path from 'path';
import { promises as fs } from 'fs';
import ejs from 'ejs';
import { fileURLToPath } from 'url';
import {callLLMByType, getModelNameByType, MAIN_MODEL} from "../../middleware/llm.js";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let IMAGE_DESCRIPTION_PROMPT = '';

// Lazy‑load the prompt so startup isn't slowed if image descriptions are never used
async function loadImageDescriptionPrompt() {
    if (IMAGE_DESCRIPTION_PROMPT) return IMAGE_DESCRIPTION_PROMPT;

    const templatePath = path.join(__dirname, '../../../prompts', 'image-description.ejs');
    try {
        const template = await fs.readFile(templatePath, 'utf8');
        IMAGE_DESCRIPTION_PROMPT = ejs.render(template, {});
    } catch (err) {
        console.warn("[imageUtils] Could not load image-description.ejs prompt – falling back to default.");
        IMAGE_DESCRIPTION_PROMPT = 'You are an image analysis expert. Describe the attached image in vivid, concrete detail. Mention notable objects, their colors, relative positions, the scene and overall mood. Avoid speculation beyond what is visible.';
    }

    return IMAGE_DESCRIPTION_PROMPT;
}

/**
 * Generate a textual description for an image using an LLM capable of vision.
 *
 * @param {string} imageDataUrl - Base‑64 data URI (data:image/…;base64,…) or external https URL.
 * @param {string} [modelName]   - Model to use. Defaults to MAIN_MODEL.
 * @returns {Promise<string>} A plain‑text description.
 */
async function generateImageDescription(imageDataUrl, modelName = MAIN_MODEL, additionalPrompt = null, sessionData = null) {
    const prompt = await loadImageDescriptionPrompt();

    let content = [];

    if(additionalPrompt) {
        content.push({
            type: "text",
            text: "Pay attention to: " + additionalPrompt
        })
    }

    content.push({
        type: 'image_url',
        image_url: { url: imageDataUrl }
    });

    const messages = [
        { role: 'system', content: prompt },
        {
            role: 'user',
            content: content
        }
    ];

    const resp = await callLLMByType(MAIN_MODEL, {
        messages,
        temperature: 0.5,
        max_tokens: 512
    });

    if(sessionData) {
        let sessionId = sessionData.sessionId;
        if (sessionId) {
            const { estimateTokens } = await import('../../services/agent/index.js');
            const { projectSessionManager } = await import('../../services/sessions/index.js');
            // Get token counts either from API response or estimate them
            const promptTokens = resp?.usage?.prompt_tokens
                ?? estimateTokens(JSON.stringify(imageDataUrl));
            const completionTokens = resp?.usage?.completion_tokens
                ?? estimateTokens(JSON.stringify(resp.content || ''));

            // Add usage to session accounting through the manager
            let model = getModelNameByType(MAIN_MODEL);
            await projectSessionManager.addUsage(sessionId, model, promptTokens, completionTokens);
        }
    }

    return (resp && resp.content) ? resp.content.trim() : '[No description]';
}

export {
    generateImageDescription
};