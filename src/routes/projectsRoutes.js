// REST API – projects **and** sessions in one place
// ---------------------------------------------------------------------------

import express from 'express';
import store from '../db/store.js';

const routerProjects = express.Router();
const routerSessions = express.Router();

/* ─────────── Projects CRUD ─────────── */

routerProjects.get('/', async (_req, res) => {
  try {
    await store.ensureDefaultProjectExists();
    let { sessionId, projectId } = await store.getCurrentIds();

    const projects = await store.listProjects();
    if ((!projectId || !sessionId) && projects.length) {
      projectId = projects[0].id;
      const sessions = await store.listSessionsForProject(projectId);
      if (sessions.length) {
        sessionId = sessions[0].id;
        await store.setCurrentSession(sessionId);
      }
    }
    res.json({ projects, currentProjectId: projectId, currentSessionId: sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

routerProjects.post('/', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Project title is required' });

    const projectId      = await store.createProject(title);
    const firstSessionId = await store.createSession(projectId, 'Session 1',
        { directory: null, conversation: [] });
    await store.setCurrentSession(firstSessionId);

    const meta = await store.db.get(`project:${projectId}:meta`);
    res.status(201).json({ id: projectId, ...meta, initialSessionId: firstSessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

routerProjects.get('/:id', async (req, res) => {
  try {
    const meta = await store.db.get(`project:${req.params.id}:meta`);
    res.json({ id: req.params.id, ...meta });
  } catch {
    res.status(404).json({ error: 'Project not found' });
  }
});

routerProjects.put('/:id', async (req, res) => {
  try {
    const { name, status } = req.body;
    if (!name && status === undefined) return res.status(400).json({ error: 'Nothing to update' });

    // Create updates object with only the fields that are provided
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (status !== undefined) updates.status = status;
    const updated = await store.updateProjectMeta(req.params.id, updates);
    if (!updated) return res.status(404).json({ error: 'Project not found' });
    res.json({ id: req.params.id, ...updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

routerProjects.delete('/:id', async (req, res) => {
  try {
    await store.deleteProject(req.params.id);

    let { projectId, sessionId } = await store.getCurrentIds();
    if (!projectId) {
      const projects = await store.listProjects();
      if (projects.length) {
        projectId = projects[0].id;
        const sessions = await store.listSessionsForProject(projectId);
        sessionId = sessions.length ? sessions[0].id : null;
        if (sessionId) await store.setCurrentSession(sessionId);
      }
    }
    res.json({ success: true, currentProjectId: projectId, currentSessionId: sessionId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/* ─────────── Project‑scoped sessions ─────────── */

routerProjects.get('/:id/sessions', async (req, res) => {
  try {
    res.json(await store.listSessionsForProject(req.params.id));
  } catch {
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

routerProjects.post('/:id/sessions', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name is required' });

    const id   = await store.createSession(req.params.id, name,
        { directory: null, conversation: [] });
    const meta = await store.getSessionMeta(id);
    await store.setCurrentSession(id);

    res.status(201).json({ id, ...meta });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

/* ─────────── Global session CRUD ─────────── */

routerSessions.get('/:id', async (req, res) => {
  try {
    const meta = await store.getSessionMeta(req.params.id);
    const data = await store.getSessionData(req.params.id);


    const systemMessage = await getSystemAndContext(data.workingDirectory, data);
    
    res.json({ id: req.params.id, ...meta, data, systemMessage });
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

routerSessions.put('/:id/meta', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Session name is required' });

    const updated = await store.updateSessionMeta(req.params.id, { name });
    if (!updated) return res.status(404).json({ error: 'Session not found' });
    res.json({ id: req.params.id, ...updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

routerSessions.put('/:id/data', async (req, res) => {
  try {
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Session data is required' });

    const updated = await store.updateSessionData(req.params.id, data);
    res.json({ id: req.params.id, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update session data' });
  }
});

routerSessions.delete('/:id', async (req, res) => {
  try {
    const meta = await store.getSessionMeta(req.params.id);
    const sessions = await store.listSessionsForProject(meta.projectId);

    if (sessions.length <= 1) {
      return res.status(400).json({ error: 'Cannot delete the only session in a project.' });
    }

    await store.deleteSession(req.params.id);

    // If that was current, pick another
    let { sessionId } = await store.getCurrentIds();
    if (!sessionId) {
      const remaining = await store.listSessionsForProject(meta.projectId);
      if (remaining.length) await store.setCurrentSession(remaining[0].id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

// Import the canonical schema
import { FIELD_NAMES, DEFAULT_SESSION_DATA } from '../services/sessions/schema.js';
import { projectSessionManager } from '../services/sessions/index.js';
import {getSystemAndContext} from "../services/agent/index.js"; // Import manager for reset

// New endpoint to clear a session's data while preserving its metadata
routerSessions.post('/:id/clear', async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const preserveTasks = req.query.preserveTasks === 'true';
    console.log(`Attempting to clear session: ${sessionId}`);

    let existingWorkingDirectory = null;
    let existingAgentId = null;
    let existingMcpAlias = null;
    let existingMcpUrl = null;
    let existingTasks = [];

    // 1. Try to get the *current* working directory, agentId, and MCP data (handle potential legacy fields)
    try {
      const existingRawData = await store.getSessionData(sessionId);
      // Use the same logic as normalization to find the correct working directory
      existingWorkingDirectory = existingRawData?.[FIELD_NAMES.WORKING_DIRECTORY]
                              || existingRawData?.[FIELD_NAMES.LEGACY_DIRECTORY]
                              || null;
      existingAgentId = existingRawData?.[FIELD_NAMES.AGENT_ID] || null;
      existingMcpAlias = existingRawData?.[FIELD_NAMES.MCP_ALIAS] || null;
      existingMcpUrl = existingRawData?.[FIELD_NAMES.MCP_URL] || null;
      existingTasks = existingRawData?.[FIELD_NAMES.TASKS] || [];

      console.log(`Found existing working directory for session ${sessionId}: ${existingWorkingDirectory}`);
      console.log(`Found existing agent ID for session ${sessionId}: ${existingAgentId}`);
      console.log(`Found existing MCP alias for session ${sessionId}: ${existingMcpAlias}`);
      console.log(`Found existing MCP URL for session ${sessionId}: ${existingMcpUrl}`);
    } catch (err) {
      // If session data doesn't exist (e.g., corrupted/partially deleted), log but proceed with null values.
       if (err.status === 404 || err.code === 'LEVEL_NOT_FOUND') {
           console.warn(`Session data not found for ${sessionId} during clear. Proceeding without preserving working directory or agent ID.`);
       } else {
           // Rethrow unexpected errors
           throw err;
      }
    }

    // 2. Construct the cleared data object using the canonical schema
    const clearedData = {
      ...DEFAULT_SESSION_DATA, // Start with defaults
      [FIELD_NAMES.WORKING_DIRECTORY]: existingWorkingDirectory, // Preserve the found WD
      [FIELD_NAMES.AGENT_ID]: existingAgentId, // Preserve the found agent ID
      [FIELD_NAMES.MCP_ALIAS]: existingMcpAlias, // Preserve the found MCP alias
      [FIELD_NAMES.MCP_URL]: existingMcpUrl, // Preserve the found MCP URL
      ...(preserveTasks ? { [FIELD_NAMES.TASKS]: existingTasks } : {}),
      // updatedAt will be added by setSessionData/saveSession
    };

    // 3. Use setSessionData to replace the existing data completely
    // Add updatedAt timestamp here or rely on setSessionData to do it
    const savedData = await store.setSessionData(sessionId, { ...clearedData, [FIELD_NAMES.UPDATED_AT]: Date.now() });
    console.log(`Session ${sessionId} cleared. Preserved WD: ${savedData[FIELD_NAMES.WORKING_DIRECTORY]}, Agent ID: ${savedData[FIELD_NAMES.AGENT_ID]}, MCP Alias: ${savedData[FIELD_NAMES.MCP_ALIAS]}, MCP URL: ${savedData[FIELD_NAMES.MCP_URL]}`);

    // 4. Reset the in-memory session in ProjectSessionManager IMMEDIATELY
    // Pass the definitively cleared and saved data.
    projectSessionManager.resetSession(sessionId, savedData);
    console.log(`In-memory session ${sessionId} reset after clearing.`);

    res.json({ success: true, id: sessionId, data: savedData });

  } catch (err) {
    console.error(`Failed to clear session ${sessionId}:`, err);
    res.status(500).json({ error: `Failed to clear session data: ${err.message}` });
  }
});

/* ─────────── Set current IDs ─────────── */

routerSessions.post('/set-current', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    await store.setCurrentSession(sessionId);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set current session' });
  }
});

export { routerProjects, routerSessions };
