import agentStore from "./db/agentStore.js";

export async function getPromptOverride(sessionData, promptName, originalPrompt) {
    let promptText = originalPrompt;
    if(sessionData && sessionData.agentId) {
        let agentId = sessionData.agentId;
        let agent = await agentStore.getAgent(agentId);
        if(agent && agent.agent) {
            agent = agent.agent;
            if(agent["prompt-overrides"]?.[promptName]) {
                promptText = agent["prompt-overrides"]?.[promptName];
            }
        }
    }

    return promptText;
}

export async function getFilteredToolList(sessionData, toolList, defaultAllow) {
    let overrideAgent = null;
    if(sessionData && sessionData.agentId) {
        let agentId = sessionData.agentId;
        let agent = await agentStore.getAgent(agentId);
        if (agent && agent.agent) {
            overrideAgent = agent.agent;
        }
    }
    let filteredList = [];
    for(let i = 0; i < toolList.length; i++) {
        let tool = toolList[i];

        let allowList = defaultAllow;

        if(overrideAgent) {
            allowList = overrideAgent["tool_list"];
        }

        if(allowList.includes(tool.function.name)) {
            filteredList.push(tool);
        }
    }

    return filteredList;
}