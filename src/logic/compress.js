import {callLLMByType, EXPERT_MODEL} from "../middleware/llm.js";
import path from "path";
import fs from "fs";
import {getPromptOverride} from "../utils.js";
import ejs from "ejs";
import {fileURLToPath} from "url";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function compressConversationHistory(history, sessionData) {
    let historyString = JSON.stringify(history);

    const templatePath = path.join(__dirname, '..', '..', 'prompts', 'compressor.ejs');
    let templateString = fs.readFileSync(templatePath, 'utf8');

    const systemPrompt = ejs.render(templateString);

    const response = await callLLMByType(EXPERT_MODEL, {
        messages: [
            {
                role: 'system',
                content: systemPrompt
            },
            {
                role: 'user',
                content: historyString,
            },
        ],
        max_completion_tokens: 20000
    }, sessionData);

    let modified = [];
    modified.push(JSON.parse(JSON.stringify(history[0])));
    modified.push({
        role: 'assistant',
        content: response.content,
    });

    return modified;
}

export {
    compressConversationHistory
}