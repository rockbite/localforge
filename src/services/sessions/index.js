/**
 * src/services/sessions/index.js - Centralized manager for project sessions
 * Loads, caches, and persists session data from/to the database
 */

import store from '../../db/store.js';
import { EventEmitter } from 'events';
import {
    addTask,
    removeTask,
    editTask,
    moveTask,
    setTaskStatus,
    listTasks,
    flattenTasks,
    STATUSES as TASK_STATUSES,
    findTaskById
} from '../tasks/index.js';
import { addUsage as addAccountingUsage_ } from '../accounting/index.js';
import { FIELD_NAMES, DEFAULT_SESSION_DATA } from './schema.js';

// Emitters for broadcasting changes
export const sessionTaskEvents = new EventEmitter();
export const sessionAccountingEvents = new EventEmitter();
export const sessionToolLogEvents = new EventEmitter();
export const sessionAgentStateEvents = new EventEmitter();

// Session expiration from memory cache
const ACTIVE_SESSION_TTL = 10 * 60 * 1000; // 10 minutes inactive timeout

class ProjectSessionManager {
    constructor() {
        this.activeSessions = new Map(); // sessionId -> { data: SessionData, lastAccess: timestamp, savingPromise: Promise | null, interruptionRequested: boolean }
        // Start a periodic cleanup timer
        setInterval(() => this.cleanupInactiveSessions(), ACTIVE_SESSION_TTL / 2);
    }
    
    /**
     * Resets an active session's in-memory data with the provided data
     * Used when clearing a session to prevent stale data reappearing
     * @param {string} sessionId - The ID of the session to reset
     * @param {object} freshData - New data to replace existing session data
     */
    resetSession(sessionId, freshData) {
        // Just replace the active session data completely
        this.activeSessions.set(sessionId, {
            data: { ...freshData, updatedAt: Date.now() },
            lastAccess: Date.now(),
            savingPromise: null,
            interruptionRequested: false
        });
        
        // Emit events to notify any active clients
        sessionTaskEvents.emit('tasks_reset', { sessionId });
        sessionToolLogEvents.emit('logs_reset', { sessionId });
        sessionAccountingEvents.emit('accounting_reset', { 
            sessionId, 
            totalUSD: 0, 
            breakdown: {} 
        });
    }

    /**
     * Normalizes raw session data retrieved from the store to conform to the canonical schema.
     * Handles legacy field names and ensures all required fields exist.
     * @param {object} rawData - The raw data object from the database (store.getSessionData).
     * @returns {object} A session data object adhering to the canonical schema.
     */
    normalizeSessionData(rawData) {
        if (!rawData) {
            // Should not happen if store.getSessionData works, but handle defensively
            console.warn('normalizeSessionData received null or undefined rawData, returning default.');
            return { ...DEFAULT_SESSION_DATA };
        }

        const normalized = { ...DEFAULT_SESSION_DATA }; // Start with defaults

        // 1. Preserve Working Directory (Handle legacy 'directory')
        normalized[FIELD_NAMES.WORKING_DIRECTORY] = rawData[FIELD_NAMES.WORKING_DIRECTORY]
                                                || rawData[FIELD_NAMES.LEGACY_DIRECTORY]
                                                || null; // Explicitly null if neither exists
                                                
        // 1.1 Preserve Agent ID if it exists
        normalized[FIELD_NAMES.AGENT_ID] = rawData[FIELD_NAMES.AGENT_ID] || null;

        // 1.2 Preserve MCP data if it exists
        normalized[FIELD_NAMES.MCP_ALIAS] = rawData[FIELD_NAMES.MCP_ALIAS] || null;
        normalized[FIELD_NAMES.MCP_URL] = rawData[FIELD_NAMES.MCP_URL] || null;

        // 2. Preserve History (Handle legacy 'conversation')
        const history = rawData[FIELD_NAMES.HISTORY] || rawData[FIELD_NAMES.LEGACY_CONVERSATION];
        normalized[FIELD_NAMES.HISTORY] = Array.isArray(history) ? history : [];

        // 3. Preserve Accounting (Handle legacy 'accountingData' and root-level fields)
        if (rawData[FIELD_NAMES.ACCOUNTING]) {
            normalized[FIELD_NAMES.ACCOUNTING] = rawData[FIELD_NAMES.ACCOUNTING];
        } else if (rawData[FIELD_NAMES.LEGACY_ACCOUNTING_DATA]) {
            normalized[FIELD_NAMES.ACCOUNTING] = rawData[FIELD_NAMES.LEGACY_ACCOUNTING_DATA];
        } else if (rawData[FIELD_NAMES.LEGACY_MODELS] || rawData[FIELD_NAMES.LEGACY_TOTAL_USD] !== undefined) {
            // Migrate from old root-level accounting fields
            normalized[FIELD_NAMES.ACCOUNTING] = {
                models: rawData[FIELD_NAMES.LEGACY_MODELS] || {},
                totalUSD: rawData[FIELD_NAMES.LEGACY_TOTAL_USD] || 0
            };
        } else {
            // Ensure default exists if no accounting data found
            normalized[FIELD_NAMES.ACCOUNTING] = { models: {}, totalUSD: 0 };
        }

        // 4. Preserve Tasks
        normalized[FIELD_NAMES.TASKS] = Array.isArray(rawData[FIELD_NAMES.TASKS]) ? rawData[FIELD_NAMES.TASKS] : [];

        // 4.1 Preserve task pinned state
        normalized[FIELD_NAMES.TASKS_PINNED] = typeof rawData[FIELD_NAMES.TASKS_PINNED] === 'boolean'
            ? rawData[FIELD_NAMES.TASKS_PINNED]
            : false;

        // 5. Preserve Tool Logs (Handle legacy 'logs' if necessary - verify usage)
        const toolLogs = rawData[FIELD_NAMES.TOOL_LOGS] || rawData[FIELD_NAMES.LEGACY_LOGS]; // Check if 'logs' was used
        normalized[FIELD_NAMES.TOOL_LOGS] = Array.isArray(toolLogs) ? toolLogs : [];

        // 6. Preserve Agent State
        normalized[FIELD_NAMES.AGENT_STATE] = rawData[FIELD_NAMES.AGENT_STATE] || { ...DEFAULT_SESSION_DATA[FIELD_NAMES.AGENT_STATE] };
        
        // 7. Preserve Update Timestamp (mainly for reference, overwritten on save)
        normalized[FIELD_NAMES.UPDATED_AT] = rawData[FIELD_NAMES.UPDATED_AT] || Date.now();

        // Optional: Log if migration occurred
        if (rawData[FIELD_NAMES.LEGACY_DIRECTORY] ||
            rawData[FIELD_NAMES.LEGACY_CONVERSATION] ||
            rawData[FIELD_NAMES.LEGACY_ACCOUNTING_DATA] ||
            rawData[FIELD_NAMES.LEGACY_MODELS] ||
            rawData[FIELD_NAMES.LEGACY_TOTAL_USD] !== undefined) {
            console.log(`Normalized session data, migrated legacy fields.`);
        }

        return normalized;
    }

    /**
     * Loads session data from store if not cached or stale.
     * @param {string} sessionId
     * @returns {Promise<object>} Session data object (history, tasks, accounting, workingDirectory)
     */
    async loadSession(sessionId) {
        const cached = this.activeSessions.get(sessionId);
        if (cached && (Date.now() - cached.lastAccess < ACTIVE_SESSION_TTL)) {
            cached.lastAccess = Date.now();
            // If a save operation is in progress, wait for it before returning potentially stale data
            if(cached.savingPromise) await cached.savingPromise;
            return cached.data;
        }

        try {
            const rawData = await store.getSessionData(sessionId);
            
            // Normalize the data using our canonical schema
            const sessionData = this.normalizeSessionData(rawData);
            
            this.activeSessions.set(sessionId, {
                data: sessionData,
                lastAccess: Date.now(),
                savingPromise: null,
                interruptionRequested: false
            });
            
            return sessionData;
        } catch (error) {
            console.error(`Failed to load session ${sessionId}:`, error);
            throw new Error(`Session not found or failed to load: ${sessionId}`);
        }
    }

    /**
     * Saves the session data back to the store.
     * @param {string} sessionId
     */
    async saveSession(sessionId) {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (!sessionEntry) {
            console.warn(`Attempted to save non-active session: ${sessionId}`);
            return;
        }

        // Avoid concurrent saves for the same session
        if (sessionEntry.savingPromise) {
            // Already saving, wait for it to complete
            await sessionEntry.savingPromise;
            // Re-check if still active after waiting
            if (!this.activeSessions.has(sessionId)) return;
        }

        // Prepare data using canonical fields (already normalized on load)
        // Add/Update the 'updatedAt' timestamp using the canonical name
        const saveData = {
            ...sessionEntry.data,
            [FIELD_NAMES.UPDATED_AT]: Date.now()
        };
        sessionEntry.data = saveData; // Update cache with what we are saving

        // Use setSessionData to guarantee replacement instead of updateSessionData
        const savePromise = store.setSessionData(sessionId, saveData)
            .then(() => {
                // do nothing
            })
            .catch(err => {
                console.error(`Failed to save session ${sessionId}:`, err);
                // Potentially add more robust error handling/retry logic here
            })
            .finally(() => {
                // Clear the saving flag only if it's our promise
                if (sessionEntry.savingPromise === savePromise) {
                    sessionEntry.savingPromise = null;
                }
            });

        sessionEntry.savingPromise = savePromise;
        await savePromise; // Wait for the save to complete before returning
    }

    /**
     * Get session data, ensuring it's loaded
     * @param {string} sessionId
     * @returns {Promise<object>} Session data
     */
    async getSession(sessionId) {
        return this.loadSession(sessionId);
    }

    // --- Task Management Wrappers ---
    
    /**
     * Get tasks for a session
     * @param {string} sessionId
     * @param {object} opts — opts.flat forces legacy flat list
     * @returns {Promise<Array>} Array of tasks (possibly hierarchical)
     */
    async getTasks(sessionId, opts = {}) {
        const sessionData = await this.getSession(sessionId);
        if (opts.flat) return flattenTasks(sessionData[FIELD_NAMES.TASKS] || []);
        return listTasks(sessionData[FIELD_NAMES.TASKS] || []);
    }

    /**
     * Add a task to a session
     * @param {string} sessionId
     * @param {object} taskData
     * @param {string|null} parentId — if supplied, adds as subtask
     * @returns {Promise<object>} The created task
     */
    async addTask(sessionId, taskData, parentId = null, save = true) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS] = sessionData[FIELD_NAMES.TASKS] || [];
        if (parentId) taskData.parentId = parentId;
        const newTask = addTask(sessionData[FIELD_NAMES.TASKS], taskData); // Mutates sessionData.tasks
        // Emit task update event, include parentId if relevant
        sessionTaskEvents.emit('task_diff_update', { 
            sessionId, 
            type: 'add', 
            task: newTask,
            parentId: parentId || null
        });

        if(save) {
            await this.saveSession(sessionId);
        }
        return newTask;
    }

    /**
     * Remove a task from a session
     * @param {string} sessionId
     * @param {string} taskId
     * @returns {Promise<boolean>} Success indicator
     */
    async removeTask(sessionId, taskId, save = true) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS] = sessionData[FIELD_NAMES.TASKS] || [];
        const success = removeTask(sessionData[FIELD_NAMES.TASKS], taskId);
        
        if (success) {
            sessionTaskEvents.emit('task_diff_update', { 
                sessionId, 
                type: 'remove', 
                taskId 
            });
            if (save) {
                await this.saveSession(sessionId);
            }
        }
        
        return success;
    }

    /**
     * Edit a task in a session
     * @param {string} sessionId
     * @param {string} taskId
     * @param {object} updates
     * @returns {Promise<object|null>} Updated task or null
     */
    async editTask(sessionId, taskId, updates, save = true) {
        // special case: changing parentId via updates.parentId
        const { parentId } = updates || {};
        if (parentId !== undefined) {
            delete updates.parentId; // remove to avoid normal edit path processing
            await this.moveTask(sessionId, taskId, parentId, save);
        }
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS] = sessionData[FIELD_NAMES.TASKS] || [];
        const updatedTask = editTask(sessionData[FIELD_NAMES.TASKS], taskId, updates);
        
        if (updatedTask) {
            sessionTaskEvents.emit('task_diff_update', { 
                sessionId, 
                type: 'update', 
                task: updatedTask 
            });
            if(save) {
                await this.saveSession(sessionId);
            }
        }
        
        return updatedTask;
    }

    /**
     * Set task status in a session
     * @param {string} sessionId
     * @param {string} taskId
     * @param {string} status
     * @returns {Promise<object|null>} Updated task or null
     */
    /**
     * Move a task to a new parent (or root)
     */
    async moveTask(sessionId, taskId, newParentId = null, save = true) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS] = sessionData[FIELD_NAMES.TASKS] || [];
        const oldTaskList = JSON.parse(JSON.stringify(sessionData[FIELD_NAMES.TASKS])); // deep copy pre-move
        const success = moveTask(sessionData[FIELD_NAMES.TASKS], taskId, newParentId);
        if (success) {
            // Find the moved task in new tree
            const movedTask = findTaskById(sessionData[FIELD_NAMES.TASKS], taskId);
            // 1. emit removal from old location
            sessionTaskEvents.emit('task_diff_update', {
                sessionId,
                type: 'remove',
                taskId
            });
            // 2. emit add into new location (parentId null ⇒ root)
            sessionTaskEvents.emit('task_diff_update', {
                sessionId,
                type: 'add',
                task: movedTask,
                parentId: newParentId || null
            });
            if (save) await this.saveSession(sessionId);
        }
        return success;
    }

    async setTaskStatus(sessionId, taskId, status, save = true) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS] = sessionData[FIELD_NAMES.TASKS] || [];
        const updatedTask = setTaskStatus(sessionData[FIELD_NAMES.TASKS], taskId, status);
        
        if (updatedTask) {
            sessionTaskEvents.emit('task_diff_update', { 
                sessionId, 
                type: 'update', 
                task: updatedTask 
            });
            if(save) {
                await this.saveSession(sessionId);
            }
        }
        
        return updatedTask;
    }

    // --- Accounting Wrapper ---
    
    /**
     * Add usage to session's accounting
     * @param {string} sessionId
     * @param {string} model
     * @param {number} promptTokens
     * @param {number} completionTokens
     */
    async addUsage(sessionId, model, promptTokens, completionTokens) {
        const sessionData = await this.getSession(sessionId);
        // Ensure the accounting object exists using the canonical name
        sessionData[FIELD_NAMES.ACCOUNTING] = sessionData[FIELD_NAMES.ACCOUNTING] || { models: {}, totalUSD: 0 };

        // Use the imported accounting logic on the canonical field
        addAccountingUsage_(sessionData[FIELD_NAMES.ACCOUNTING], model, promptTokens, completionTokens);

        // Emit event with the updated data from the canonical field
        sessionAccountingEvents.emit('updated', {
            sessionId: sessionId,
            totalUSD: sessionData[FIELD_NAMES.ACCOUNTING].totalUSD.toFixed(4),
            breakdown: sessionData[FIELD_NAMES.ACCOUNTING].models
        });

        // Also emit token count update in real-time
        sessionAccountingEvents.emit('token_count', {
            sessionId: sessionId,
            current: (sessionData[FIELD_NAMES.ACCOUNTING].input || 0) + (sessionData[FIELD_NAMES.ACCOUNTING].output || 0),
            max: 1000000,
            accounting: {
                input: sessionData[FIELD_NAMES.ACCOUNTING].input || 0,
                output: sessionData[FIELD_NAMES.ACCOUNTING].output || 0
            }
        });

        await this.saveSession(sessionId);
    }

    // --- History Management ---
    
    /**
     * Append only a user message to the session history
     * @param {string} sessionId
     * @param {object} userMessage
     */
    async appendUserMessageOnly(sessionId, userMessage) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.HISTORY] = sessionData[FIELD_NAMES.HISTORY] || [];
        sessionData[FIELD_NAMES.HISTORY].push(userMessage);
        await this.saveSession(sessionId);
    }

    /**
     * Update the most recent user message in history
     * @param {string} sessionId
     * @param {string} updatedContent
     */
    async updateUserMessage(sessionId, updatedContent) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.HISTORY] = sessionData[FIELD_NAMES.HISTORY] || [];
        
        // Find the last user message in history
        for (let i = sessionData[FIELD_NAMES.HISTORY].length - 1; i >= 0; i--) {
            if (sessionData[FIELD_NAMES.HISTORY][i].role === 'user') {
                sessionData[FIELD_NAMES.HISTORY][i].content = updatedContent;
                break;
            }
        }
        
        await this.saveSession(sessionId);
    }

    /**
     * Append only an assistant message to the session history
     * @param {string} sessionId
     * @param {object} assistantMessage
     */
    async appendAssistantMessage(sessionId, assistantMessage) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.HISTORY] = sessionData[FIELD_NAMES.HISTORY] || [];
        sessionData[FIELD_NAMES.HISTORY].push(assistantMessage);
        await this.saveSession(sessionId);
    }

    /**
     * Append messages to the session history
     * @param {string} sessionId
     * @param {object} userMessage
     * @param {object} assistantMessage
     * @deprecated Use appendUserMessageOnly and appendAssistantMessage instead
     */
    async appendHistory(sessionId, userMessage, assistantMessage) {
        console.warn("appendHistory is deprecated. Use separate append methods.");
        await this.appendUserMessageOnly(sessionId, userMessage);
        await this.appendAssistantMessage(sessionId, assistantMessage);
    }
    
    /**
     * Append a tool log entry to the session
     * @param {string} sessionId
     * @param {object} logEntry - Tool log entry object
     * @returns {Promise<object>} The log entry with added logId and timestamp
     */
    async appendToolLog(sessionId, logEntry) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TOOL_LOGS] = sessionData[FIELD_NAMES.TOOL_LOGS] || [];
        
        // Add unique ID and timestamp if not provided
        if (!logEntry.logId) {
            logEntry.logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }
        logEntry.timestamp = logEntry.timestamp || Date.now();
        
        // Add to logs array
        sessionData[FIELD_NAMES.TOOL_LOGS].push(logEntry);
        
        // Emit event for real-time updates
        sessionToolLogEvents.emit('append', { sessionId, logEntry });
        
        await this.saveSession(sessionId);
        return logEntry;
    }
    
    /**
     * Set the agent state for a session
     * @param {string} sessionId
     * @param {object} newState - New agent state object
     * @returns {Promise<object>} The updated agent state
     */
    async setAgentState(sessionId, newState) {
        const sessionData = await this.getSession(sessionId);
        
        // Get current state to merge with new state
        const currentState = sessionData[FIELD_NAMES.AGENT_STATE] || {
            status: 'idle',
            statusText: null,
            startTime: null,
            activeToolCallId: null
        };
        
        // Create updated state by merging
        const updatedState = {
            status: newState.status !== undefined ? newState.status : currentState.status,
            statusText: newState.statusText !== undefined ? newState.statusText : currentState.statusText,
            startTime: newState.startTime !== undefined ? newState.startTime : currentState.startTime,
            activeToolCallId: newState.activeToolCallId !== undefined ? newState.activeToolCallId : currentState.activeToolCallId
        };
        
        // Force reset fields if idle
        if (updatedState.status === 'idle') {
            updatedState.statusText = null;
            updatedState.startTime = null;
            updatedState.activeToolCallId = null;
            this.clearInterruption(sessionId); // Clear flag when explicitly set to idle
        }
        
        // Update session data
        sessionData[FIELD_NAMES.AGENT_STATE] = updatedState;
        
        // Emit event for real-time updates
        sessionAgentStateEvents.emit('update', { sessionId, agentState: updatedState });
        
        // Don't log agent state changes as tool logs
        
        await this.saveSession(sessionId);
        return updatedState;
    }
    
    /**
     * Get tool logs for a session
     * @param {string} sessionId
     * @returns {Promise<Array>} Array of tool logs
     */
    async getToolLogs(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return sessionData[FIELD_NAMES.TOOL_LOGS] || [];
    }
    
    /**
     * Get current agent state for a session
     * @param {string} sessionId
     * @returns {Promise<object>} Current agent state
     */
    async getAgentState(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return sessionData[FIELD_NAMES.AGENT_STATE] || {
            status: 'idle',
            statusText: null,
            startTime: null,
            activeToolCallId: null
        };
    }

    /**
     * Set the working directory for a session
     * @param {string} sessionId
     * @param {string|null} directory
     */
    async setWorkingDirectory(sessionId, directory) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.WORKING_DIRECTORY] = directory;
        await this.saveSession(sessionId);
    }

    /**
     * Get the working directory for a session
     * @param {string} sessionId
     * @returns {Promise<string|null>} Working directory path or null
     */
    async getWorkingDirectory(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return sessionData[FIELD_NAMES.WORKING_DIRECTORY];
    }
    
    /**
     * Set the agent ID for a session
     * @param {string} sessionId
     * @param {string|null} agentId
     */
    async setAgentId(sessionId, agentId) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.AGENT_ID] = agentId;
        await this.saveSession(sessionId);
    }

    /**
     * Get the agent ID for a session
     * @param {string} sessionId
     * @returns {Promise<string|null>} Agent ID or null
     */
    async getAgentId(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return sessionData[FIELD_NAMES.AGENT_ID];
    }

    /**
     * Set the MCP data for a session
     * @param {string} sessionId
     * @param {string} mcpAlias
     * @param {string} mcpUrl
     */
    async setMcpData(sessionId, mcpAlias, mcpUrl) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.MCP_ALIAS] = mcpAlias;
        sessionData[FIELD_NAMES.MCP_URL] = mcpUrl;
        await this.saveSession(sessionId);
    }

    /**
     * Set whether the task panel is pinned
     * @param {string} sessionId
     * @param {boolean} pinned
     */
    async setTasksPinned(sessionId, pinned) {
        const sessionData = await this.getSession(sessionId);
        sessionData[FIELD_NAMES.TASKS_PINNED] = !!pinned;
        await this.saveSession(sessionId);
    }

    /**
     * Get pinned state for tasks
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async getTasksPinned(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return !!sessionData[FIELD_NAMES.TASKS_PINNED];
    }

    /**
     * Get the MCP data for a session
     * @param {string} sessionId
     * @returns {Promise<object>} Object with mcpAlias and mcpUrl
     */
    async getMcpData(sessionId) {
        const sessionData = await this.getSession(sessionId);
        return {
            mcpAlias: sessionData[FIELD_NAMES.MCP_ALIAS] || null,
            mcpUrl: sessionData[FIELD_NAMES.MCP_URL] || null
        };
    }

    /**
     * Flags a session for interruption.
     * @param {string} sessionId
     * @returns {boolean} True if the session was active and flagged, false otherwise.
     */
    requestInterruption(sessionId) {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            console.log(`[${sessionId}] Interruption requested.`);
            sessionEntry.interruptionRequested = true;
            
            // Emit an event to provide immediate feedback, which is especially useful for
            // when a bash tool command or other long-running tool is executing
            sessionAgentStateEvents.emit('interrupt_requested', { 
                sessionId: sessionId,
                timestamp: Date.now() 
            });
            
            return true;
        }
        console.warn(`[${sessionId}] Interruption requested for inactive/unknown session.`);
        return false;
    }

    /**
     * Checks if an interruption has been requested for a session.
     * @param {string} sessionId
     * @returns {boolean}
     */
    isInterruptionRequested(sessionId) {
        const sessionEntry = this.activeSessions.get(sessionId);
        return sessionEntry ? sessionEntry.interruptionRequested : false;
    }

    /**
     * Clears the interruption flag for a session.
     * @param {string} sessionId
     */
    clearInterruption(sessionId) {
        const sessionEntry = this.activeSessions.get(sessionId);
        if (sessionEntry) {
            if (sessionEntry.interruptionRequested) {
                console.log(`[${sessionId}] Clearing interruption flag.`);
            }
            sessionEntry.interruptionRequested = false;
        }
    }
    
    /**
     * Finalizes an interruption by appending a message and resetting state.
     * @param {string} sessionId
     */
    async finalizeInterruption(sessionId) {
        console.log(`[${sessionId}] Finalizing interruption.`);
        // 1. Append the interruption message
        await this.appendAssistantMessage(sessionId, {
            role: 'assistant',
            content: '[Request interrupted by user]'
        });

        // 2. Set state to idle (this will also clear the flag via the modified setAgentState)
        await this.setAgentState(sessionId, { status: 'idle' });
    }

    // --- Cache Cleanup ---
    
    /**
     * Remove inactive sessions from memory cache
     */
    cleanupInactiveSessions() {
        const now = Date.now();
        for (const [sessionId, sessionEntry] of this.activeSessions.entries()) {
            if (now - sessionEntry.lastAccess > ACTIVE_SESSION_TTL && !sessionEntry.savingPromise) {
                console.log(`Unloading inactive session ${sessionId} from cache.`);
                this.activeSessions.delete(sessionId);
            }
        }
    }
}

// Singleton instance
export const projectSessionManager = new ProjectSessionManager();
export { TASK_STATUSES }; // Re-export task statuses