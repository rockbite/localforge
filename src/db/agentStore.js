// agentStore.js
/* ─────────── Agents file-based storage ─────────── */

import fs from "fs/promises";
import path from "path";
import os from "os";


export class AgentStore {

    constructor(projectName = 'localforge') {
        // Set up file paths
        this.appDir = path.join(os.homedir(), `.${projectName}`);
        this.agentsDir = path.join(this.appDir, 'agents');
    }

    /**
     * Lists all agent files from the agents directory
     * @returns {Promise<Array>} Array of agent objects
     */
    async listAgents() {
        await this._ensureDirectoriesExist();

        try {
            const files = await fs.readdir(this.agentsDir);
            const agentFiles = files.filter(file => file.endsWith('.json'));

            const agents = [];
            for (const file of agentFiles) {
                try {
                    const agentData = await fs.readFile(path.join(this.agentsDir, file), 'utf8');
                    const agent = JSON.parse(agentData);
                    // Add the filename (without extension) as the id
                    agent.id = path.basename(file, '.json');
                    agents.push(agent);
                } catch (error) {
                    console.error(`Error reading agent file ${file}:`, error);
                    // Skip corrupted files
                }
            }

            return agents;
        } catch (error) {
            console.error('Error listing agents:', error);
            return [];
        }
    }

    /**
     * Gets a single agent by id
     * @param {string} id - The agent id
     * @returns {Promise<Object|null>} Agent object or null if not found
     */
    async getAgent(id) {
        try {
            const filePath = path.join(this.agentsDir, `${id}.json`);
            const agentData = await fs.readFile(filePath, 'utf8');
            const agent = JSON.parse(agentData);
            agent.id = id;
            return agent;
        } catch (error) {
            return null;
        }
    }

    /**
     * Creates a new agent file
     * @param {Object} agent - The agent object to create
     * @returns {Promise<string>} The new agent id
     */
    async createAgent(agent) {
        await this._ensureDirectoriesExist();

        // Generate a unique ID for the agent
        const id = `agent_${Date.now().toString(36)}`;
        const filePath = path.join(this.agentsDir, `${id}.json`);

        // Clone the agent object to avoid mutating the original
        const agentToSave = {...agent};

        // Don't store id in the file itself, since it's encoded in the filename
        if (agentToSave.id) {
            delete agentToSave.id;
        }

        await fs.writeFile(filePath, JSON.stringify(agentToSave, null, 2), 'utf8');
        return id;
    }

    /**
     * Updates an existing agent file
     * @param {string} id - The agent id
     * @param {Object} updates - The agent updates
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async updateAgent(id, updates) {
        try {
            const filePath = path.join(this.agentsDir, `${id}.json`);

            // Try to read the existing agent first
            let existingAgent;
            try {
                const agentData = await fs.readFile(filePath, 'utf8');
                existingAgent = JSON.parse(agentData);
            } catch (error) {
                return false; // Agent doesn't exist
            }

            // Merge updates with existing data
            const updatedAgent = {...existingAgent, ...updates};

            // Remove id if present in the updates
            if (updatedAgent.id) {
                delete updatedAgent.id;
            }

            await fs.writeFile(filePath, JSON.stringify(updatedAgent, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error(`Error updating agent ${id}:`, error);
            return false;
        }
    }

    /**
     * Deletes an agent file
     * @param {string} id - The agent id
     * @returns {Promise<boolean>} True if successful, false otherwise
     */
    async deleteAgent(id) {
        try {
            const filePath = path.join(this.agentsDir, `${id}.json`);
            await fs.unlink(filePath);
            return true;
        } catch (error) {
            console.error(`Error deleting agent ${id}:`, error);
            return false;
        }
    }

    async _ensureDirectoriesExist() {
        try {
            await fs.access(this.agentsDir);
        } catch (error) {
            await fs.mkdir(this.agentsDir, { recursive: true });
        }
    }
}

export const agentStore = new AgentStore();
export default agentStore;