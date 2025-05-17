/**
 * Defines the canonical field names for session data objects.
 * Use these constants throughout the application to avoid typos and ensure consistency.
 */
export const FIELD_NAMES = Object.freeze({
    // Core fields
    WORKING_DIRECTORY: 'workingDirectory', // Canonical name for the project's working directory
    AGENT_ID: 'agentId',                  // Canonical name for the selected agent ID
    MCP_ALIAS: 'mcpAlias',                // Canonical name for the selected MCP alias
    MCP_URL: 'mcpUrl',                    // Canonical name for the selected MCP URL
    HISTORY: 'history',                   // Canonical name for chat message history (replaces 'conversation')
    ACCOUNTING: 'accounting',             // Canonical name for usage/cost tracking (replaces 'accountingData')
    TASKS: 'tasks',                       // Canonical name for the list of tasks
    TASKS_PINNED: 'tasksPinned',         // Tracks whether task panel is pinned
    
    TOOL_LOGS: 'toolLogs',                // Canonical name for tool execution logs
    AGENT_STATE: 'agentState',            // Canonical name for the agent's current operational state
    UPDATED_AT: 'updatedAt',              // Timestamp of the last update

    // Legacy fields (for reference during migration/normalization)
    LEGACY_DIRECTORY: 'directory',
    LEGACY_CONVERSATION: 'conversation',
    LEGACY_ACCOUNTING_DATA: 'accountingData',
    LEGACY_MODELS: 'models', // Legacy root-level accounting field
    LEGACY_TOTAL_USD: 'totalUSD', // Legacy root-level accounting field
    LEGACY_LOGS: 'logs' // Legacy name for tool logs? Verify usage if needed.
});

// Define default structure for a new/cleared session data object
export const DEFAULT_SESSION_DATA = Object.freeze({
    [FIELD_NAMES.WORKING_DIRECTORY]: null,
    [FIELD_NAMES.AGENT_ID]: null,
    [FIELD_NAMES.MCP_ALIAS]: null,
    [FIELD_NAMES.MCP_URL]: null,
    [FIELD_NAMES.HISTORY]: [],
    [FIELD_NAMES.ACCOUNTING]: { models: {}, totalUSD: 0 },
    [FIELD_NAMES.TASKS]: [],
    [FIELD_NAMES.TASKS_PINNED]: false,
    [FIELD_NAMES.TOOL_LOGS]: [],
    [FIELD_NAMES.AGENT_STATE]: {
        status: 'idle',
        statusText: null,
        startTime: null,
        activeToolCallId: null
    },
    // Note: updatedAt is added dynamically on save/update
});