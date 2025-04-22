import { SETTINGS_SCHEMA } from '../../src/routes/settingsRoutes.js';
import store from '../../src/db/store.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ejs from 'ejs';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

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
        const { files = [], prompt: userPrompt, sessionId } = args || {};

        if (!userPrompt || typeof userPrompt !== 'string') {
            throw new Error('ExpertAdviceTool.execute: "prompt" argument is required');
        }

        // --- Utility helpers -------------------------------------------------

        // Very rough token estimator – assumes ~4.91 characters per token which is
        // good enough for high‑level context window checks.
        const estimateTokens = (str) => Math.ceil((str || '').length / 4.91);

        // Limits (safety margin applied)
        const O3_TOKEN_LIMIT = 200_000;   // gpt‑4o‑mini – 200k context window
        const GEMINI_SOFT_LIMIT = 800_000; // We stop adding files at ~800k even

        // Start building the file context and decide which model to use
        let chosenModel = 'o3'; // default to o3 (OpenAI gpt‑4o‑mini)
        let currentTokenCount = 0;
        let fileContextBlocks = '';

        for (const suppliedPath of files) {
            // Resolve to absolute path to be safe
            const absolutePath = path.isAbsolute(suppliedPath)
                ? suppliedPath
                : path.resolve(process.cwd(), suppliedPath);

            let fileContent = '';
            try {
                fileContent = fs.readFileSync(absolutePath, 'utf8');
            } catch (err) {
                fileContent = `UNABLE TO READ FILE: ${err.message}`;
            }

            let fileTokens = estimateTokens(fileContent);

            // If we are still on o3 but would exceed its window, switch to Gemini
            if (chosenModel === 'o3' && currentTokenCount + fileTokens > O3_TOKEN_LIMIT) {
                chosenModel = 'gemini';
            }

            // If we are on gemini and close to the soft limit, truncate or skip
            if (chosenModel === 'gemini') {
                const remaining = GEMINI_SOFT_LIMIT - currentTokenCount;

                if (remaining <= 0) break; // we are full – stop adding files

                if (fileTokens > remaining) {
                    // Need to trim content so we don't exceed soft limit
                    const charsAllowed = remaining * 4; // convert back to chars
                    fileContent = fileContent.slice(0, charsAllowed);
                    fileTokens = remaining; // we will be exactly at the limit
                }
            }

            // Append block – always annotate with file path for clarity
            fileContextBlocks += `\n--- FILE: ${absolutePath}\n${fileContent}\n--- END FILE\n`;

            currentTokenCount += fileTokens;

            // Stop if we hit gemini soft limit exactly
            if (chosenModel === 'gemini' && currentTokenCount >= GEMINI_SOFT_LIMIT) {
                break;
            }
        }

        // --------------------------------------------------------------------
        // Assemble final prompt via EJS template
        const templatePath = path.join(__dirname, '..', '..', 'prompts', 'expert-advice.ejs');
        let templateString;
        try {
            templateString = fs.readFileSync(templatePath, 'utf8');
        } catch (err) {
            throw new Error(`ExpertAdviceTool.execute: failed to read template – ${err.message}`);
        }

        const finalPrompt = ejs.render(templateString, {
            fileContext: fileContextBlocks.trim(),
            userPrompt: userPrompt.trim(),
        });

        // --------------------------------------------------------------------
        // Call the chosen LLM and return its response
        let answer;
        try {
            if (chosenModel === 'gemini') {
                answer = await callGemini(finalPrompt);
            } else {
                answer = await callO3(finalPrompt);
            }
            
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

async function callGemini(prompt) {
    const apiKey = store.getSetting('geminiApiKey');
    if (!apiKey) {
        throw new Error('GEMINI_API_KEY settings variable is not set');
    }

    const ai = new GoogleGenAI({ apiKey });

    const model = 'gemini-2.5-pro-exp-03-25';

    const config = {
        responseMimeType: 'text/plain',
    };

    const contents = [
        {
            role: 'user',
            parts: [{ text: prompt }],
        },
    ];

    return ai.models
        .generateContent({ model, config, contents })
        .then((response) => {
            // The SDK returns different shapes depending on helpers used – try common cases.
            if (response && typeof response.text === 'function') {
                return response.text();
            }
            if (typeof response?.text === 'string') {
                return response.text;
            }
            if (response?.candidates?.[0]?.content?.parts) {
                return (
                    response.candidates[0].content.parts
                        .filter((p) => p.text)
                        .map((p) => p.text)
                        .join('') || ''
                );
            }
            return '';
        });
}

async function callO3(prompt) {
    const apiKey = store.getSetting('openaiApiKey');

    const openai = new OpenAI({
        apiKey
    });

    return openai.chat.completions
        .create({
            model: 'o3',
            messages: [
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            max_completion_tokens: 8192,
        })
        .then((completion) => completion.choices?.[0]?.message?.content || '');
}