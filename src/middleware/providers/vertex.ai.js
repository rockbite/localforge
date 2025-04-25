//vertex.ai.js
import {
    VertexAI
} from '@google-cloud/vertexai';
import {processGeminiOptions, processGeminiResponse} from "./gemini.js";

export default {
    name: 'vertex.ai',
    settings: ['apiKey', 'project', 'location'],

    /**
     */
    async chat(options, providerOptions) {
        let modelName = options.model;

        const vertexAI = new VertexAI({
            project: providerOptions.project,
            location: providerOptions.location,
        });

        const { contents, config } = processGeminiOptions(options);

        let systemInstruction = config.systemInstruction;
        let tools = config.tools;
        delete config.systemInstruction;
        delete config.tools;

        const vertexModel = vertexAI.getGenerativeModel({
            model: modelName,
            safetySettings: providerOptions.safetySettings, // Pass through if provided
            systemInstruction: systemInstruction,
        });


        const result = await vertexModel.generateContent({
            contents: contents,
            generationConfig: config,
            tools: tools
        });
        // Vertex SDK usually returns the response directly in result.response
        let responsePayload = result.response;

        return processGeminiResponse(responsePayload);
    }
};