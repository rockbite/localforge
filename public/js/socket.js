// src/socket.js
// Purpose: Manages the Socket.IO connection and handles incoming/outgoing events.

import { io } from "https://cdn.socket.io/4.7.4/socket.io.esm.min.js"; // Using CDN ESM import
import { appState } from './state.js';
import * as api from './api.js'; // Needed for loading settings on API key error

// Import UI update functions from their respective modules
import { addAgentMessage, addUserMessage, clearMessages, enableChatInput, scrollToBottom } from './ui/chat.js';
import { setStatus } from './ui/status.js'; // Assuming ui/status.js exports setStatus
import { clearLogs as clearToolLogs, renderOrUpdateToolWidget, showThinkingWidget, removeThinkingWidget } from './ui/toolLog.js';
import { setWorkingDirectoryDisplay, showDirectoryModal } from './ui/workspace.js';
import { populateSettingsForm, showSettingsModal } from './ui/settings.js'; // Assuming settings.js exports showSettingsModal

/**
 * Initializes the Socket.IO connection and sets up basic event listeners.
 * Stores the socket instance in appState.
 */
export function initializeSocket() {
    if (appState.socket) {
        if (!appState.socket.connected) {
            console.log("Socket instance exists, attempting to reconnect...");
            appState.socket.connect();
        } else {
            console.log("Socket already connected.");
        }
        return;
    }

    console.log("Initializing new socket connection...");
    const socket = io({
        // Consider adding reconnection options if needed
        // reconnectionAttempts: 5,
        // reconnectionDelay: 1000,
    });
    appState.socket = socket; // Store the instance

    // Setup basic connection listeners
    socket.on('connect', () => {
        console.log('Connected to server with socket ID:', socket.id);
        setStatus('connecting', 'Connecting to session...');
        if (appState.currentSessionId && appState.currentProjectId) {
            console.log(`Attempting to join session: ${appState.currentSessionId}`);
            emitJoinSession(socket, appState.currentProjectId, appState.currentSessionId);
        } else {
            console.error("Cannot join session on connect: currentSessionId or currentProjectId is missing.");
            setStatus('error', 'Session Error');
            addAgentMessage("⚠️ Could not determine the current session. Please select one or refresh.");
            enableChatInput(false); // Disable input if we can't join a session
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        // Only show persistent error message if disconnect wasn't intentional (e.g., io client disconnect)
        if (reason !== 'io client disconnect') {
            addAgentMessage('<span class="material-icons" style="color: var(--error-color); vertical-align: middle; font-size: 18px; margin-right: 4px;">wifi_off</span> Disconnected. Attempting to reconnect...');
            setStatus('disconnected', 'Disconnected'); // Use a distinct status for disconnect
        } else {
            console.log("Socket disconnected by client.");
            setStatus('disconnected', 'Offline'); // Or a suitable status like 'offline'
        }
        enableChatInput(false); // Disable input on disconnect
    });

    // Handle connection errors (e.g., server unavailable initially)
    socket.on('connect_error', (err) => {
        console.error('Connection Error:', err.message);
        setStatus('error', 'Connection Failed');
        addAgentMessage(`⚠️ Failed to connect to the server: ${err.message}. Please ensure the backend is running and refresh.`);
        enableChatInput(false); // Disable input on connection error
    });


    socket.on('error', (error) => { // General errors from the server via socket.emit('error', ...)
        console.error('Server-side Socket Error:', error);
        
        // Only process if it's for the current session or no session specified (system-wide error)
        if (error.sessionId && !isCurrentSession(error.sessionId)) {
            console.log(`Ignoring error for session ${error.sessionId} (current: ${appState.currentSessionId})`);
            return;
        }
        
        removeThinkingWidget(); // Stop thinking indicator on error
        addAgentMessage(`⚠️ Server Error: ${error?.message || 'Unknown error occurred'}`);
        setStatus('error', 'Server Error'); // Set status to error
        enableChatInput(true); // Usually allow input after a server error, unless it's critical

        // Specific error handling (e.g., API Key)
        if (error && error.message === 'API_KEY_MISSING') {
            console.warn("API Key missing, attempting to show settings.");
            enableChatInput(false); // Disable input until key is provided
            api.loadSettingsFromServer()
                .then(settings => populateSettingsForm(settings)) // Populate form with current (empty) key
                .catch(err => console.error("Failed to load settings for modal:", err))
                .finally(() => showSettingsModal()); // Show the modal from settings.js
        }
    });

    // Setup application-specific listeners
    setupSocketEventHandlers(socket);

    console.log("Socket initialized.");
}

/**
 * Sets up listeners for application-specific Socket.IO events.
 * @param {object} socket - The Socket.IO socket instance.
 */
export function setupSocketEventHandlers(socket) {

    socket.on('session_joined', (data) => {
        try {
            // Store current session and project IDs
            appState.currentSessionId = data.sessionId;
            appState.currentProjectId = data.projectId;
            
            // --- 1. Clear existing state displays ---
            clearMessages();
            clearToolLogs();
            removeThinkingWidget(); // Ensure any lingering thinking widget is gone
            appState.historicalToolLogs = []; // Clear stored historical logs

            // Clear Task Tracker (from legacy main-legacy.js)
            const tracker = document.getElementById('tracker');
            if (tracker && typeof tracker.clearAll === 'function') {
                tracker.clearAll();
                console.log("Task tracker cleared.");
            } else {
                // console.warn("Task tracker element or clearAll method not found.");
            }

            // --- 2. Add Welcome Message --- (Consider making this optional)
            addAgentMessage("Hello! How can I assist you today?");

            // --- 3. Populate History ---
            if (data.history && Array.isArray(data.history)) {
                data.history.forEach(message => {
                    if (message.role === 'user') {
                        // Pass the entire message object so addUserMessage can filter out tool results
                        addUserMessage(message);
                    } else if (message.role === 'assistant' || message.role === 'system') {
                        // Pass the entire message object so addAgentMessage can filter out tool uses
                        addAgentMessage(message);
                    }
                });
                // Ensure scroll after loading history
                scrollToBottom(true); // Force scroll to bottom after initial load
            }

            // --- 4. Populate Tasks --- (using setTasks for initial load without animations)
            if (tracker && data.tasks && Array.isArray(data.tasks)) {
                console.log(`Populating ${data.tasks.length} initial tasks...`);

                // Format all tasks at once for the setTasks method
                const formattedTasks = data.tasks.map(t => ({
                    id: t.id,
                    text: t.title || t.description || 'Untitled Task',
                    status: t.status || 'pending'
                }));
                // Use setTasks for bulk loading without animations

                // a bit of disclaimer,
                // Use setTimeout to delay the initial setTasks call slightly.
                // This ensures the task-tracker-widget component has completed its
                // initial LitElement rendering cycle and the 'repeat' directive
                // is fully ready before processing the bulk task list.
                // This prevents a timing issue where tasks might not render if set too early.
                setTimeout(() => {
                    tracker.setTasks(formattedTasks);
                }, 0);

                console.log("Initial tasks populated.");
            }

            // --- 5. Populate Accounting / Cost --- (from legacy main-legacy.js)
            const initialCost = parseFloat(data.accounting?.totalUSD ?? 0);
            if (window.costAnimator) {
                // Use animator to set initial value directly, no animation
                window.costAnimator.setValue(initialCost);
            } else {
                // Fallback to direct DOM update
                const costDisplay = document.getElementById('cost-display');
                if (costDisplay) {
                    costDisplay.textContent = `$${initialCost.toFixed(4)}`;
                }
            }

            // --- 6. Update Working Directory ---
            appState.workingDirectory = data.workingDirectory || null;
            setWorkingDirectoryDisplay(appState.workingDirectory);

            // --- 7. Store and Render Historical Tool Logs ---
            if (data.toolLogs && Array.isArray(data.toolLogs)) {
                appState.historicalToolLogs = data.toolLogs; // Store logs first
                const toolCallIdsToRender = new Set();
                data.toolLogs.forEach(log => {
                    if (log.type === 'TOOL_START' && log.toolCallId) {
                        toolCallIdsToRender.add(log.toolCallId);
                    }
                });
                console.log(`Rendering ${toolCallIdsToRender.size} historical tool logs`);
                toolCallIdsToRender.forEach(toolCallId => {
                    // Pass current logs and agent state for accurate rendering
                    renderOrUpdateToolWidget(toolCallId, appState.historicalToolLogs, data.agentState);
                });
            }

            // --- 8. Process Agent State ---
            if (data.agentState) {
                console.log('Applying initial agent state:', data.agentState);
                appState.currentAgentState = data.agentState;
                setStatus(data.agentState.status, data.agentState.statusText); // Update status first

                // Log if this is a reconnect during active processing, but we don't need special handling
                if (data.reconnectedDuringProcessing) {
                    console.log('Client reconnected during active processing');
                    // No special flag needed - the server will broadcast to all connected sockets
                }

                // Show thinking or active tool widget based on persisted state
                if (data.agentState.status === 'thinking') {
                    showThinkingWidget(data.agentState.statusText || 'Processing...', data.agentState.startTime);
                } else if (data.agentState.status === 'tool_running' && data.agentState.activeToolCallId) {
                    // Ensure the specific tool widget shows as active/running using the stored logs and current state
                    renderOrUpdateToolWidget(
                        data.agentState.activeToolCallId,
                        appState.historicalToolLogs, // Use the logs we just stored
                        data.agentState
                    );
                }
                // setStatus should handle enabling/disabling input
                if (data.agentState.status === 'idle') {
                    const messageInput = document.getElementById('message-input');
                    // Optional: Focus input only if it's not already focused to avoid annoyance
                    if (messageInput && document.activeElement !== messageInput) {
                        // messageInput.focus(); // Re-enable if desired
                    }
                }

            } else {
                // Default to idle if no state provided
                appState.currentAgentState = { status: 'idle', statusText: null, startTime: null, activeToolCallId: null };
                setStatus('idle');
                const messageInput = document.getElementById('message-input');
                if (messageInput) {
                    // messageInput.focus(); // Re-enable if desired
                }
            }

            // --- 9. Update Model Info --- (from legacy main-legacy.js `model_info` handler)
            const mainSpan = document.getElementById('main-model');
            const auxSpan = document.getElementById('aux-model');
            if (mainSpan && data.modelInfo?.mainModel) mainSpan.textContent = data.modelInfo.mainModel;
            if (auxSpan && data.modelInfo?.auxModel) auxSpan.textContent = data.modelInfo.auxModel;

            // --- 10. Update Token Count if provided on join --- (from legacy)
            const tokenCountSpan = document.getElementById('token-count');
            if (tokenCountSpan && data.tokenInfo) {
                try {
                    const formattedCurrent = data.tokenInfo.current.toLocaleString();
                    const formattedMax = data.tokenInfo.max.toLocaleString();
                    tokenCountSpan.textContent = `${formattedCurrent}/${formattedMax} tokens`;
                } catch (e) {
                    console.error("Error formatting token count:", e);
                    tokenCountSpan.textContent = `Error`;
                }
            }

            console.log("session_joined processing complete.");

        } catch (error) {
            console.error("Error processing session_joined data:", error);
            addAgentMessage("⚠️ Error loading session data. Please try switching sessions or refreshing.");
            setStatus('error', 'Session Load Error');
            enableChatInput(false); // Disable input on load error
        }
    });

    socket.on('session_join_error', (data) => {
        console.error(`Failed to join session ${data.sessionId}:`, data.error);
        addAgentMessage(`⚠️ Failed to load session: ${data.error}. Please select another session or refresh.`);
        setStatus('error', 'Session Error');
        enableChatInput(false); // Disable input on join error
    });

    // Helper function to check if a message belongs to the current session
    const isCurrentSession = (sessionId) => {
        return sessionId === appState.currentSessionId;
    };
    
    // Agent lifecycle updates
    socket.on('agent_state_update', (data) => {
        // console.log('Agent state update received:', data); // Can be noisy
        
        // Update currentSessionId in case we just connected and joined the session
        // This ensures we don't miss updates that arrive immediately after reconnection
        if (data.sessionId && socket.userData && socket.userData.currentSessionId === data.sessionId) {
            appState.currentSessionId = data.sessionId;
        }
        
        // Only process the update if it's for the current session
        if (!isCurrentSession(data.sessionId)) {
            console.log(`Ignoring agent state update for session ${data.sessionId} (current: ${appState.currentSessionId})`);
            return;
        }
        
        if (data.agentState) {
            const previousState = { ...appState.currentAgentState };
            appState.currentAgentState = data.agentState;

            setStatus(data.agentState.status, data.agentState.statusText); // Update status indicator

            // No special handling needed for reconnection cases anymore
            // The server will broadcast agent_response to all connected sockets

            // Thinking Widget Management
            if (data.agentState.status === 'thinking') {
                showThinkingWidget(data.agentState.statusText || 'Processing...', data.agentState.startTime);
            } else {
                // Remove thinking widget if status is *not* thinking
                removeThinkingWidget();
            }

            // Tool Widget Management (based on transitions)
            // If a tool WAS running but isn't anymore in the new state OR is no longer the *active* one
            if (previousState.status === 'tool_running' && previousState.activeToolCallId &&
                previousState.activeToolCallId !== data.agentState.activeToolCallId) {
                // Update the widget for the tool that just finished/stopped being active
                renderOrUpdateToolWidget(previousState.activeToolCallId, appState.historicalToolLogs, data.agentState);
            }
            // If a tool IS running in the new state (could be the same one or a new one)
            if (data.agentState.status === 'tool_running' && data.agentState.activeToolCallId) {
                // Update the widget for the *currently* active tool
                renderOrUpdateToolWidget(data.agentState.activeToolCallId, appState.historicalToolLogs, data.agentState);
            }

            // Handle focus only if transitioning to idle
            if (data.agentState.status === 'idle' && previousState.status !== 'idle') {
                const messageInput = document.getElementById('message-input');
                if (messageInput && document.activeElement !== messageInput) {
                    // messageInput.focus(); // Re-enable if desired
                }
            }
        } else {
            console.warn("Received agent_state_update without agentState data.");
        }
    });

    // Append new tool log entries and update widgets
    socket.on('tool_log_append', (data) => {
        // console.log('Tool log update received:', data); // Can be noisy
        
        // Update currentSessionId in case we just connected and joined the session
        // This ensures we don't miss updates that arrive immediately after reconnection
        if (data.sessionId && socket.userData && socket.userData.currentSessionId === data.sessionId) {
            appState.currentSessionId = data.sessionId;
        }
        
        // Only process the update if it's for the current session
        if (!isCurrentSession(data.sessionId)) {
            console.log(`Ignoring tool log append for session ${data.sessionId} (current: ${appState.currentSessionId})`);
            return;
        }
        
        if (data.logEntry) {
            appState.historicalToolLogs.push(data.logEntry); // Add to our history

            // Update the UI widget for this toolCallId using the *full* historical log array
            // This ensures the widget has all context (start, end, etc.)
            if (data.logEntry.toolCallId) {
                renderOrUpdateToolWidget(
                    data.logEntry.toolCallId,
                    appState.historicalToolLogs, // Pass the complete, updated logs
                    appState.currentAgentState // Pass current agent state for context (is it active?)
                );
            }
        } else {
            console.warn("Received tool_log_append without logEntry data.");
        }
    });


    // Handle final agent response (message content)
    socket.on('agent_response', (response) => {
        console.log('Agent response received.');
        
        // Update currentSessionId in case we just connected and joined the session
        // This ensures we don't miss responses that arrive immediately after reconnection
        if (response.sessionId && socket.userData && socket.userData.currentSessionId === response.sessionId) {
            appState.currentSessionId = response.sessionId;
        }
        
        // Only process the response if it's for the current session
        if (!isCurrentSession(response.sessionId)) {
            console.log(`Ignoring agent response for session ${response.sessionId} (current: ${appState.currentSessionId})`);
            return;
        }
        
        removeThinkingWidget(); // Response means thinking is done

        // No special handling needed for reconnected clients
        // The correct message is automatically broadcast to all clients

        if (response.message && response.message.content) {
            // Don't check for duplicates as it's causing issues
            addAgentMessage(response.message.content);
        } else {
            console.warn("Received agent_response without message content:", response);
            // Add a fallback message if appropriate
            addAgentMessage("Received an empty response from the agent.");
        }

        // Update token count if included in the final response (from legacy)
        const tokenCountSpan = document.getElementById('token-count');
        if (tokenCountSpan && response.tokenCount !== undefined && response.maxTokens !== undefined) {
            try {
                const formattedCurrent = response.tokenCount.toLocaleString();
                const formattedMax = response.maxTokens.toLocaleString();
                tokenCountSpan.textContent = `${formattedCurrent}/${formattedMax}`;
            } catch (e) {
                console.error("Error formatting token count in agent_response:", e);
                tokenCountSpan.textContent = `Error`;
            }
        }
        // Agent state should transition to 'idle' via agent_state_update shortly after this.
        // If it's *guaranteed*, we don't need to force idle here. If sometimes it might not,
        // uncommenting the below provides a safety net.
        // if (appState.currentAgentState.status !== 'idle') {
        //     console.warn("Forcing state to idle after agent_response as it wasn't idle yet.");
        //     appState.currentAgentState = { status: 'idle', statusText: null, startTime: null, activeToolCallId: null };
        //     setStatus('idle');
        // }
    });

    // Workspace setup confirmation/errors
    socket.on('setup_confirmed', (data) => {
        console.log('Working directory confirmed by backend:', data);
        // Optional feedback to user:
        // addAgentMessage(`Workspace ready: \`${data.directory || 'None'}\``);
        enableChatInput(true); // Ensure input is enabled after successful setup
        setStatus('idle'); // Assume idle after setup confirmation unless agent state says otherwise
    });

    socket.on('setup_error', (error) => {
        console.error('Workspace Setup error:', error);
        addAgentMessage(`<span class="material-icons error-icon">error</span> Error setting up working directory: ${error?.message || 'Unknown error'}`);
        setStatus('error', 'Setup Error');
        showDirectoryModal(); // Re-show modal on error
        enableChatInput(false); // Disable input until directory is fixed
    });
    
    // Handle interruption events
    socket.on('interrupt_acknowledged', (data) => {
        console.log('Interruption request acknowledged:', data);
        // Update status text to indicate interruption is in progress
        setStatus('thinking', 'Stopping processing...');
        
        // The stop button visual state has already been updated in the click handler
    });
    
    socket.on('interrupt_complete', (data) => {
        console.log('Interruption completed:', data);
        removeThinkingWidget(); // Remove thinking indicator
        setStatus('idle'); // Reset status to idle
        enableChatInput(true); // Re-enable input
        
        // Also reset the stop button manually (just to be safe)
        const stopButton = document.getElementById('stop-button');
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.classList.remove('stopping');
            stopButton.innerHTML = '<span class="material-icons">stop</span> Stop';
        }
    });
    
    socket.on('interrupt_error', (error) => {
        console.error('Interruption error:', error);
        alert(`Could not interrupt: ${error.message || 'Unknown error'}`);
        
        // Reset the stop button
        const stopButton = document.getElementById('stop-button');
        if (stopButton) {
            stopButton.disabled = false;
            stopButton.classList.remove('stopping');
            stopButton.innerHTML = '<span class="material-icons">stop</span> Stop';
        }
    });

    // --- Updates for UI components ---

    // Handle Model Info updates (from legacy main-legacy.js)
    socket.on('model_info', (data) => {
        // console.log("Model info update:", data);
        const expertSpan = document.getElementById('expert-model');
        const mainSpan = document.getElementById('main-model');
        const auxSpan = document.getElementById('aux-model');
        if (expertSpan && data.expertModel) expertSpan.textContent = data.expertModel;
        if (mainSpan && data.mainModel) mainSpan.textContent = data.mainModel;
        if (auxSpan && data.auxModel) auxSpan.textContent = data.auxModel;
    });

    // Handle Task Diff updates (from legacy main-legacy.js)
    socket.on('task_diff_update', (data) => {
        try {
            // Only process the update if it's for the current session
            if (!isCurrentSession(data.sessionId)) {
                console.log(`Ignoring task diff update for session ${data.sessionId} (current: ${appState.currentSessionId})`);
                return;
            }
            
            const tracker = document.getElementById('tracker');
            if (!tracker || !data || !data.type) return;

            // console.log('Received task diff:', data); // Can be noisy

            switch (data.type) {
                case 'add':
                    if (data.task && typeof tracker.addTask === 'function') {
                        tracker.addTask({
                            id: data.task.id,
                            text: data.task.title || data.task.description || 'Untitled Task',
                            status: data.task.status || 'pending'
                        });
                    }
                    break;

                case 'remove':
                    if (data.taskId && typeof tracker.removeTask === 'function') {
                        tracker.removeTask(data.taskId);
                    }
                    break;

                case 'update':
                    if (data.task && data.task.id) {
                        // Update text if available and function exists
                        if (data.task.title !== undefined || data.task.description !== undefined) {
                            if (typeof tracker.renameTask === 'function') {
                                tracker.renameTask(
                                    data.task.id,
                                    data.task.title || data.task.description || 'Untitled Task'
                                );
                            }
                        }
                        // Update status if available and function exists
                        if (data.task.status !== undefined) {
                            if (typeof tracker.setStatus === 'function') {
                                tracker.setStatus(
                                    data.task.id,
                                    data.task.status || 'pending'
                                );
                            }
                        }
                    }
                    break;

                default:
                    console.warn('Unknown task update type:', data.type);
            }
        } catch (err) {
            console.error('Failed to process task diff update:', err, data);
        }
    });

    // Handle Cost updates (from legacy main-legacy.js)
    socket.on('cost_update', (data) => {
        // console.log('Cost update received:', data); // Can be noisy
        
        // Only process the update if it's for the current session
        if (!isCurrentSession(data.sessionId)) {
            console.log(`Ignoring cost update for session ${data.sessionId} (current: ${appState.currentSessionId})`);
            return;
        }
        
        const newCost = parseFloat(data.totalUSD ?? 0);
        // Use the cost animator if available, otherwise fall back to direct update
        if (window.costAnimator) {
            window.costAnimator.animateTo(newCost);
        } else {
            const costDisplay = document.getElementById('cost-display');
            if (costDisplay) {
                costDisplay.textContent = `$${newCost.toFixed(4)}`;
            }
        }
    });

    // Handle Token Count updates (from legacy main-legacy.js)
    socket.on('token_count', (data) => {
        // console.log("Token count update:", data); // Can be noisy
        const tokenCountSpan = document.getElementById('token-count');
        if (tokenCountSpan && data.current !== undefined && data.max !== undefined) {
            try {
                const formattedCurrent = data.current.toLocaleString();
                const formattedMax = data.max.toLocaleString();
                tokenCountSpan.textContent = `${formattedCurrent}/${formattedMax}`;
            } catch(e) {
                console.error("Error formatting token count:", e);
                tokenCountSpan.textContent = `Error`;
            }
        }
    });


    console.log("Socket application event handlers set up.");
}

// --- Emitter Functions ---

/** Emits 'join_session' */
export function emitJoinSession(socket, projectId, sessionId) {
    if (socket?.connected) {
        console.log(`Emitting join_session for Project ${projectId}, Session ${sessionId}`);
        socket.emit('join_session', { sessionId, projectId });
    } else {
        console.error("Cannot emit join_session: socket not connected.");
        // Optionally, update UI to reflect the failure
        setStatus('error', 'Connection Error');
        addAgentMessage("⚠️ Cannot switch session: Not connected to server.");
    }
}

/** Emits 'chat_message' */
export function emitChatMessage(socket, content) {
    if (socket?.connected) {
        // console.log("Emitting chat_message:", content); // Usually too noisy
        socket.emit('chat_message', { content });
        // Assume the agent will respond, set state accordingly
        setStatus('thinking', 'Sending...'); // Or another appropriate status
        enableChatInput(false); // Disable input while waiting for response
    } else {
        console.error("Cannot emit chat_message: socket not connected.");
        addAgentMessage("⚠️ Cannot send message: Not connected to server.");
        setStatus('error', 'Connection Error');
        enableChatInput(true); // Re-enable input if send failed
    }
}

/** Emits 'setup_workspace' */
export function emitSetupWorkspace(socket, directory) {
    if (socket?.connected) {
        console.log(`Emitting setup_workspace: ${directory || 'None'}`);
        socket.emit('setup_workspace', { directory });
        // Optional: Set status to indicate setup is in progress
        setStatus('thinking', 'Setting workspace...');
        enableChatInput(false); // Disable input during setup
    } else {
        console.error("Cannot emit setup_workspace: socket not connected.");
        addAgentMessage("⚠️ Cannot set workspace: Not connected to server.");
        setStatus('error', 'Connection Error');
    }
}