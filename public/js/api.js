// src/api.js
// Purpose: Handles all non-WebSocket HTTP API interactions with the backend.

/**
 * Fetches the list of projects and current IDs from the backend.
 * @returns {Promise<object>} Object containing projects, currentProjectId, currentSessionId.
 */
export async function fetchProjectsAndSessionIds() {
    const response = await fetch('/api/projects');
    if (!response.ok) {
        throw new Error('Failed to load projects');
    }
    return await response.json();
}


/**
 * Fetches detailed information for a specific session.
 * @param {string} sessionId - The ID of the session to fetch.
 * @returns {Promise<object | null>} The session data or null if not found.
 */
export async function fetchSessionDetails(sessionId) {
    const response = await fetch(`/api/sessions/${sessionId}`);
    if (!response.ok) {
        if (response.status === 404) {
            console.warn(`Session ${sessionId} not found via API.`);
            return null; // Explicitly return null for 404
        }
        throw new Error(`Failed to fetch session details for ${sessionId}: ${response.statusText}`);
    }
    return await response.json();
}

/**
 * Fetches the complete session data for viewing context.
 * @param {string} sessionId - The ID of the session to fetch.
 * @returns {Promise<object | null>} The complete session data or null if not found.
 */
export async function getSessionData(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
            if (response.status === 404) {
                console.warn(`Session ${sessionId} not found via API when fetching context.`);
                return null;
            }
            throw new Error(`Failed to fetch session data for context: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error fetching session data for context:', error);
        throw error;
    }
}

/**
 * Fetches the complete session data with all messages for viewing the exact LLM context.
 * @param {string} sessionId - The ID of the session to fetch.
 * @returns {Promise<object | null>} The complete session data formatted to show what's sent to LLM.
 */
export async function getFullSessionContext(sessionId) {
    try {
        // First get the basic session data
        const sessionData = await getSessionData(sessionId);
        if (!sessionData) {
            return null;
        }
        
        // Get the history from the correct property path
        const history = sessionData.data?.history || sessionData.history || [];
        
        // The actual context sent to LLM is organized as:
        // 1. System message (with environment info, etc.)
        // 2. All conversation history (user/assistant pairs)
        // The call that constructs this is in agentCore.js line ~560:
        // messagesForLLM = systemAndContextMessages.concat(persistentHistory).concat(userMessageForLLM);

        let systemText = sessionData.systemMessage[0].content;
        
        return {
            ...sessionData,
            fullContext: {
                messages: history,
                systemPromptSummary: systemText
            }
        };
    } catch (error) {
        console.error('Error fetching full session context:', error);
        throw error;
    }
}

/**
 * Fetches all sessions associated with a specific project.
 * @param {string} projectId - The ID of the project.
 * @returns {Promise<Array>} An array of session objects.
 */
export async function fetchProjectSessions(projectId) {
    const response = await fetch(`/api/projects/${projectId}/sessions`);
    if (!response.ok) {
        throw new Error(`Failed to load sessions for project ${projectId}: ${response.statusText}`);
    }
    return await response.json();
}

/**
 * Tells the backend to set the user's current session.
 * @param {string} sessionId - The ID of the session to set as current.
 * @returns {Promise<object>} The response data.
 */
export async function setCurrentSessionOnServer(sessionId) {
    const response = await fetch('/api/sessions/set-current', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
    });
    if (!response.ok) {
        throw new Error('Failed to set current session on server');
    }
    return await response.json();
}

/**
 * Updates the name of a project.
 * @param {string} projectId - The ID of the project to update.
 * @param {string} name - The new name for the project.
 * @returns {Promise<object>} The response data.
 */
export async function updateProjectName(projectId, name) {
    const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
    });
    if (!response.ok) {
        throw new Error('Failed to rename project');
    }
    return await response.json();
}

/**
 * Creates a new session within a project.
 * @param {string} projectId - The ID of the project to add the session to.
 * @param {string} name - The name for the new session.
 * @returns {Promise<object>} The newly created session object.
 */
export async function createSession(projectId, name) {
    const response = await fetch(`/api/projects/${projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
    });
    if (!response.ok) {
        throw new Error('Failed to create new session');
    }
    return await response.json();
}

/**
 * Updates the status of a project (e.g., 'active', 'archived').
 * @param {string} projectId - The ID of the project to update.
 * @param {string} status - The new status.
 * @returns {Promise<object>} The response data.
 */
export async function updateProjectStatus(projectId, status) {
    const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
    });
    if (!response.ok) {
        throw new Error(`Failed to update project status to ${status}`);
    }
    return await response.json();
}

/**
 * Deletes a project and all its associated data.
 * @param {string} projectId - The ID of the project to delete.
 * @returns {Promise<object>} The response data indicating success/failure.
 */
export async function deleteProject(projectId) {
    const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        throw new Error('Failed to delete project');
    }
    // DELETE might return 204 No Content or a JSON message
    if (response.status === 204) {
        return { success: true };
    }
    return await response.json();
}

/**
 * Updates the name (metadata) of a session.
 * @param {string} sessionId - The ID of the session to update.
 * @param {string} name - The new name for the session.
 * @returns {Promise<object>} The response data.
 */
export async function updateSessionName(sessionId, name) {
    const response = await fetch(`/api/sessions/${sessionId}/meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() })
    });
    if (!response.ok) {
        throw new Error('Failed to rename session');
    }
    return await response.json();
}

/**
 * Clears all messages and potentially other history from a session.
 * @param {string} sessionId - The ID of the session to clear.
 * @returns {Promise<object>} The response data.
 */
export async function clearSessionMessages(sessionId, { preserveTasks = false } = {}) {
    const url = preserveTasks
        ? `/api/sessions/${sessionId}/clear?preserveTasks=true`
        : `/api/sessions/${sessionId}/clear`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to clear session');
    }
    return await response.json();
}

/**
 * Deletes a session and its associated data.
 * @param {string} sessionId - The ID of the session to delete.
 * @returns {Promise<object>} The response data indicating success/failure.
 */
export async function deleteSession(sessionId) {
    const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to delete session');
    }
    if (response.status === 204) {
        return { success: true };
    }
    return await response.json();
}

/**
 * Saves the working directory preference for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @param {string | null} directory - The directory path or null to unset.
 * @returns {Promise<object>} The response data.
 */
export async function saveWorkingDirectory(sessionId, directory) {
    if (!sessionId) {
        console.warn("Attempted to save working directory without a session ID.");
        return Promise.resolve({ message: "No session ID, skipping save." });
    }
    try {
        const response = await fetch(`/api/sessions/${sessionId}/data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { workingDirectory: directory } })
        });
        if (!response.ok) {
            throw new Error('Failed to save working directory to session');
        }
        return await response.json();
    } catch (error) {
        console.error('Error saving working directory:', error);
        throw error;
    }
}

/**
 * Saves the agent ID preference for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @param {string | null} agentId - The agent ID or null to unset.
 * @returns {Promise<object>} The response data.
 */
export async function saveAgentId(sessionId, agentId) {
    if (!sessionId) {
        console.warn("Attempted to save agent ID without a session ID.");
        return Promise.resolve({ message: "No session ID, skipping save." });
    }
    try {
        const response = await fetch(`/api/sessions/${sessionId}/data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { agentId: agentId } })
        });
        if (!response.ok) {
            throw new Error('Failed to save agent ID to session');
        }
        return await response.json();
    } catch (error) {
        console.error('Error saving agent ID:', error);
        throw error;
    }
}

/**
 * Saves the MCP data preference for a specific session.
 * @param {string} sessionId - The ID of the session.
 * @param {string} mcpAlias - The MCP alias or empty string to unset.
 * @param {string} mcpUrl - The MCP URL or empty string to unset.
 * @returns {Promise<object>} The response data.
 */
export async function saveMcpData(sessionId, mcpAlias, mcpUrl) {
    if (!sessionId) {
        console.warn("Attempted to save MCP data without a session ID.");
        return Promise.resolve({ message: "No session ID, skipping save." });
    }
    try {
        const response = await fetch(`/api/sessions/${sessionId}/data`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { mcpAlias, mcpUrl } })
        });
        if (!response.ok) {
            throw new Error('Failed to save MCP data to session');
        }
        return await response.json();
    } catch (error) {
        console.error('Error saving MCP data:', error);
        throw error;
    }
}

/**
 * Loads application settings from the server.
 * @returns {Promise<object>} The settings object.
 */
export async function loadSettingsFromServer() {
    try {
        const response = await fetch('/api/settings');
        if (!response.ok) {
            throw new Error(`Failed to load settings: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading settings:', error);
        return {};
    }
}

/**
 * Loads settings schema and provider types from the server.
 * @returns {Promise<object>} The schema and provider types.
 */
export async function loadSettingsSchema() {
    try {
        const response = await fetch('/api/settings/schema');
        if (!response.ok) {
            throw new Error(`Failed to load settings schema: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error loading settings schema:', error);
        return { schema: {}, providerTypes: [] };
    }
}

/**
 * Saves application settings to the server.
 * @param {object} settings - The settings object to save.
 * @returns {Promise<object>} The response data.
 */
export async function saveSettingsToServer(settings) {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to save settings: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error saving settings:', error);
        throw error;
    }
}

/**
 * Creates a new project.
 * @param {string} name - The name of the project.
 * @param {string} [directory=""] - Optional project directory.
 * @returns {Promise<object>} The newly created project object.
 */
export async function createProject(name, directory = "") {
    try {
        const response = await fetch('/api/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: name,
                directory: directory
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to create project: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error('Error creating project:', error);
        throw error;
    }
}