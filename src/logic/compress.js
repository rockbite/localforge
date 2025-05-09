import {callLLMByType, EXPERT_MODEL} from "../middleware/llm.js";
import path from "path";
import fs from "fs";
import {getPromptOverride} from "../utils.js";
import ejs from "ejs";

async function compressConversationHistory(history, sessionData) {
    const conversation = history.slice(1);
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
        content: response,
    });

    return modified;
}

export {
    compressConversationHistory
}