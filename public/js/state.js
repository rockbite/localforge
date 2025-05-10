// public/js/state.js
// Purpose: Defines and exports the global application state.

// Global state object for the application
export const appState = {
    projects: [],
    currentProjectId: null,
    currentSessionId: null,
    currentProject: null,
    currentSession: null,
    isLoading: true,
    isInitialized: false,
    socket: null,             // Will be initialized and stored by socket.js
    workingDirectory: null,
    isAgentResponding: false, // Tracks if waiting for agent response (used by setStatus)
    currentGerund: 'Processing',
    currentAgentState: {
        status: 'idle',       // Agent's operational status: idle, thinking, tool_running
        statusText: null,     // Text accompanying the status (e.g., "Running Bash...")
        startTime: null,      // Timestamp when the current state started (for timers)
        activeToolCallId: null // ID of the tool call currently executing (if status is tool_running)
    },
    // No need for reconnectedDuringProcessing flag - server handles broadcasting to all clients
    historicalToolLogs: [], // Stores logs fetched during session join for context
    compressionStates: {}, // Map of sessionId -> {isCompressing: boolean, startTime: number}
};