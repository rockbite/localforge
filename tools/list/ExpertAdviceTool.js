import { SETTINGS_SCHEMA } from '../../src/routes/settingsRoutes.js';
import store from '../../src/db/store.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import {callLLMByType, EXPERT_MODEL} from "../../src/middleware/llm.js";
import {getPromptOverride} from "../../src/utils.js";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    name: 'ExpertAdviceTool',
    schema: {
        type: 'function',
        function: {
            name: 'ExpertAdviceTool',
            description: "- For complex tasks ask an expert! Expert can look at the files you provide and your prompt, and help you out. Experts are smart and used primarily for project architecture or task planning big questions. If you are stuck with a bug or something you are failing to solve, provide all the info package it to expert and ask!",
            parameters: {
                type: 'object',
                properties: {
                    files: {
                        type: "array",
                        items: {
                            type: "string"
                        },
                        description: "List of absolute file paths to attach"
                    },
                    prompt: {
                        type: "string",
                        description: "Prompt query for the expert"
                    }
                },
                required: ['prompt']
            }
        }
    },
    execute: async (args) => {
        const { files = [], prompt: userPrompt, sessionId, sessionData } = args || {};

        if (!userPrompt || typeof userPrompt !== 'string') {
            throw new Error('ExpertAdviceTool.execute: "prompt" argument is required');
        }

        // --- Utility helpers -------------------------------------------------

        // Very rough token estimator – assumes ~4.91 characters per token which is
        // good enough for high‑level context window checks.
        const estimateTokens = (str) => Math.ceil((str || '').length / 4.91);

        // Start building the file context and decide which model to use
        let chosenModel = 'o3'; // default to o3 (OpenAI gpt‑4o‑mini)
        let currentTokenCount = 0;
        let fileContextBlocks = '';

        for (const suppliedPath of files) {
            // Resolve to absolute path to be safe
            const absolutePath = path.isAbsolute(suppliedPath)
                ? suppliedPath
                : path.resolve(sessionData.workingDirectory, suppliedPath);

            let fileContent = '';
            try {
                fileContent = fs.readFileSync(absolutePath, 'utf8');
            } catch (err) {
                fileContent = `UNABLE TO READ FILE: ${err.message}`;
            }

            let fileTokens = estimateTokens(fileContent);
            let sliced = false;
            // todo: do better job here
            if(fileTokens > 1000000) {
                const charsAllowed = 1000000 * 4.91; // convert back to chars
                fileContent = fileContent.slice(0, charsAllowed);
                fileTokens = 1000000;
                sliced = true;
            }
            // Append block – always annotate with file path for clarity
            fileContextBlocks += `\n--- FILE: ${absolutePath}\n${fileContent}\n--- END FILE\n`;

            currentTokenCount += fileTokens;

            // Stop if we hit gemini soft limit exactly
            if (sliced) {
                break;
            }
        }



        // --------------------------------------------------------------------
        // Assemble final prompt via EJS template
        const templatePath = path.join(__dirname, '..', '..', 'prompts', 'expert-advice.ejs');
        let templateString = fs.readFileSync(templatePath, 'utf8');
        templateString = await getPromptOverride(sessionData, "expert-advice", templateString);

        const finalPrompt = ejs.render(templateString, {
            fileContext: fileContextBlocks.trim(),
            userPrompt: userPrompt.trim(),
        });

        // --------------------------------------------------------------------
        // Call the chosen LLM and return its response
        let answer;
        try {
            answer = await callModel(finalPrompt, sessionData);
            
            // Track token usage if sessionId is provided
            if (sessionId) {
                const { projectSessionManager } = await import('../../src/services/sessions/index.js');
                const { estimateTokens } = await import('../../src/services/agent/index.js');
                
                // Estimate tokens since the APIs don't always return token counts
                const promptTokens = estimateTokens(finalPrompt);
                const completionTokens = estimateTokens(answer || '');
                
                // Add usage to session accounting through the manager
                await projectSessionManager.addUsage(sessionId, chosenModel, promptTokens, completionTokens);
            }
        } catch (llmErr) {
            answer = `Error while contacting expert LLM: ${llmErr.message}`;
        }

        return { response: answer };
    },
    getDescriptiveText: (args) => {
        return `Asking Expert`;
    },
    ui: {
        icon: 'brain'
    }
};

async function callModel(prompt, sessionData) {

    const response = await callLLMByType(EXPERT_MODEL, {
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
        max_completion_tokens: 8192
    }, sessionData);

    return response.content;
}