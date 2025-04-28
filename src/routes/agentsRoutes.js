// agentsRoutes.js (ES module)
// -------------------------------------------------------------
// REST API for managing agents
// -------------------------------------------------------------

import express from 'express';
import agentStore from "../db/agentStore.js";
import { getAllToolNames } from "../../tools/index.js";
import store from "../db/store.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import {AUX_MODEL, EXPERT_MODEL, getModelNameByType, MAIN_MODEL} from "../middleware/llm.js";

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// GET /api/agents - retrieve all agents
router.get('/', async (_req, res) => {
  try {
    // List all agents from files
    const agents = await agentStore.listAgents();
    res.json(agents);
  } catch (err) {
    console.error('Error retrieving agents:', err);
    res.status(500).json({ error: 'Failed to retrieve agents' });
  }
});

// GET /api/agents/tools - retrieve all available tools
// Important: This specific route must come before the /:id route
router.get('/tools', async (_req, res) => {
  try {
    const tools = getAllToolNames();
    res.json(tools);
  } catch (err) {
    console.error('Error retrieving tools:', err);
    res.status(500).json({ error: 'Failed to retrieve tools' });
  }
});

// GET /api/agents/:id - retrieve a specific agent
router.get('/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    const agent = await agentStore.getAgent(agentId);
    
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(agent);
  } catch (err) {
    console.error(`Error retrieving agent ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to retrieve agent' });
  }
});

// POST /api/agents - add new agent
router.post('/', async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    // List all agents to check for duplicate names
    const agents = await agentStore.listAgents();
    
    // Check if name already exists
    if (agents.some(agent => agent.name === name)) {
      return res.status(400).json({ error: 'An agent with this name already exists' });
    }

    // Read the prompt template files
    const promptsDir = path.join(__dirname, '..', '..', 'prompts');
    const mainSystemTemplate = await fs.readFile(path.join(promptsDir, 'main-system.ejs'), 'utf8');
    const expertAdviceTemplate = await fs.readFile(path.join(promptsDir, 'expert-advice.ejs'), 'utf8');
    
    // Get all available tools
    const allTools = getAllToolNames();

    // Get all LLM configurations (aux, main, expert)
    const llmConfigs = store.getLlmConfigList();
    
    // Create a full agent structure
    const agentData = {
      name,
      description: "", // Add description at root level to match UI expectation
      createdAt: Date.now(),
      agent: {
        name,
        description: "", // Keep description in nested agent object for compatibility
        llms: {
          main: {
            provider:  llmConfigs.main?.provider || "",
            model: llmConfigs.main?.model || ""
          },
          expert: {
            provider:  llmConfigs.expert?.provider || "",
            model: llmConfigs.expert?.model || ""
          },
          aux: {
            provider:  llmConfigs.aux?.provider || "",
            model: llmConfigs.aux?.model || ""
          }
        },
        tool_list: allTools,
        "prompt-overrides": {
          "main-system": mainSystemTemplate,
          "expert-advice": expertAdviceTemplate
        }
      }
    };

    // Create the agent file
    const agentId = await agentStore.createAgent(agentData);
    const newAgent = await agentStore.getAgent(agentId);

    res.status(201).json(newAgent);
  } catch (err) {
    console.error('Error adding agent:', err);
    res.status(500).json({ error: 'Failed to add agent' });
  }
});

// PUT /api/agents/:id - update agent
router.put('/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    const { name, agent } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    // Check if agent exists
    const existingAgent = await agentStore.getAgent(agentId);
    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // List all agents to check for duplicate names
    const agents = await agentStore.listAgents();
    
    // Check if name already exists (except for the current agent)
    if (agents.some(a => a.name === name && a.id !== agentId)) {
      return res.status(400).json({ error: 'An agent with this name already exists' });
    }

    // Create update data with all the new fields
    const updateData = {
      name,
      description: req.body.description || "",  // Include description at root level
      updatedAt: Date.now()
    };

    // Include agent data if provided
    if (agent) {
      updateData.agent = agent;
    }

    // Update the agent file
    await agentStore.updateAgent(agentId, updateData);

    const updatedAgent = await agentStore.getAgent(agentId);
    res.json(updatedAgent);
  } catch (err) {
    console.error(`Error updating agent ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

// DELETE /api/agents/:id - delete agent
router.delete('/:id', async (req, res) => {
  try {
    const agentId = req.params.id;
    
    // Check if agent exists
    const agent = await agentStore.getAgent(agentId);
    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    // Delete the agent file
    await agentStore.deleteAgent(agentId);
    res.json({ success: true });
  } catch (err) {
    console.error(`Error deleting agent ${req.params.id}:`, err);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
});

export default router;