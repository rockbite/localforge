// src/ui/toolLog.js
// Purpose: Manage the display of tool execution logs, timers, and the thinking indicator.

import { appState } from '../state.js';
import { updateTimerDisplay } from '../utils.js'; // Import the utility

// DOM Elements specific to tool log
const toolLogContainer = document.getElementById('tool-log');

// Internal state for managing widgets and timers
const activeToolWidgets = new Map(); // Map<toolCallId, { element: HTMLElement, intervalId?: number, startTime?: number }>
const toolTimers = new Map(); // Separate map might be redundant if storing timer info in activeToolWidgets
let thinkingWidgetElement = null; // Reference to the thinking widget DOM element
let thinkingTimerIntervalId = null; // Interval ID for the thinking timer

// Mapping of tool names (or types) to Material Icons
const toolIconMap = {
    'Bash': 'terminal',
    'BatchTool': 'batch_prediction',
    'GlobTool': 'find_in_page',
    'GrepTool': 'search',
    'LS': 'folder_open',
    'View': 'visibility',
    'Edit': 'edit',
    'Replace': 'find_replace',
    'WebFetchTool': 'public',
    'DispatchAgentTool': 'smart_toy',
    'BashSafety': 'security', // Added for safety checks
    'default': 'build', // Default icon
    'thinking': 'psychology', // Icon for the thinking widget
    'success': 'check_circle', // Icon for completed/successful state
    'error': 'error', // Icon for error state
};

/**
 * Initializes the tool log area (currently does nothing, could be used for setup).
 */
export function initToolLog() {
    if (!toolLogContainer) {
        console.warn("Tool log container ('tool-log') not found.");
        return;
    }
    // Clear any potential stale content on init
    clearLogs();
    console.log("Tool Log initialized.");
}

/**
 * Renders or updates a tool log widget in the UI based on log data and agent state.
 * Handles both historical loading and live updates.
 * @param {string} toolCallId - The unique ID for the tool call.
 * @param {Array} allLogs - The complete log array (historicalToolLogs from appState).
 * @param {object | null} currentAgentState - The current agent state from appState.
 */
export function renderOrUpdateToolWidget(toolCallId, allLogs, currentAgentState) {
    if (!toolLogContainer || !toolCallId) return;

    // --- Find Relevant Logs ---
    const toolStartLog = allLogs.find(log => log.type === 'TOOL_START' && log.toolCallId === toolCallId);
    const toolEndLog = allLogs.find(log => log.type === 'TOOL_END' && log.toolCallId === toolCallId);

    if (!toolStartLog) {
        console.warn(`renderOrUpdateToolWidget: TOOL_START log not found for ${toolCallId}. Cannot render widget.`);
        return; // Need at least the start log
    }

    // --- Determine Widget State ---
    const isCompleted = !!toolEndLog;
    const isActive = !isCompleted && currentAgentState?.status === 'tool_running' && currentAgentState?.activeToolCallId === toolCallId;
    const isError = isCompleted && toolEndLog.result?.error; // Check if completed with an error in result

    // --- Get or Create Widget Element ---
    let widgetData = activeToolWidgets.get(toolCallId);
    let entryElement;
    const isNewEntry = !widgetData;

    if (isNewEntry) {
        entryElement = document.createElement('div');
        entryElement.className = 'tool-entry info compact new-entry'; // Base classes + animation class
        entryElement.dataset.toolId = toolCallId;
        toolLogContainer.prepend(entryElement); // Add to top of log
        widgetData = { element: entryElement }; // Create data object
        activeToolWidgets.set(toolCallId, widgetData); // Store reference
    } else {
        entryElement = widgetData.element;
        // Ensure classes reflect current state on updates
        entryElement.classList.remove('active', 'completed', 'error', 'new-entry');
    }

    // Apply state classes
    entryElement.classList.toggle('active', isActive);
    entryElement.classList.toggle('completed', isCompleted && !isError);
    entryElement.classList.toggle('error', isCompleted && isError);


    // --- Calculate Display Values ---
    let displayTime = '0.0s';
    let statusIconHtml = ''; // e.g., spinner
    let toolIconName = toolIconMap[toolStartLog.toolName] || toolIconMap['default'];
    let iconColorStyle = '';
    let statusText = toolStartLog.descriptiveText || `Running ${toolStartLog.toolName}...`; // Default status text

    // Determine icon, time, status based on state
    if (isCompleted) {
        const startTime = toolStartLog.timestamp;
        const endTime = toolEndLog.timestamp;
        const durationMs = Math.max(0, endTime - startTime); // Ensure non-negative
        displayTime = updateTimerDisplay(null, durationMs); // Use util, don't update element here
        statusIconHtml = ''; // No spinner when complete
        if (isError) {
            toolIconName = toolIconMap['error'];
            iconColorStyle = `style="color: var(--error-color);"`;
            statusText = toolEndLog.descriptiveText || 'Tool failed';
        } else {
            toolIconName = toolIconMap['success'];
            iconColorStyle = `style="color: var(--success-color);"`;
            statusText = toolEndLog.descriptiveText || 'Tool completed';
        }
        stopToolExecutionTimer(toolCallId); // Ensure timer is stopped

    } else if (isActive) {
        // Use agent state start time for accuracy if available, otherwise tool start time
        const startTime = currentAgentState?.startTime || toolStartLog.timestamp;
        widgetData.startTime = startTime; // Store start time for timer updates
        const elapsedMs = Math.max(0, Date.now() - startTime);
        displayTime = updateTimerDisplay(null, elapsedMs);
        statusIconHtml = `<span class="tool-spinner"></span>`; // Show spinner
        statusText = currentAgentState?.statusText || statusText; // Prefer agent state text if available
        startToolExecutionTimer(toolCallId, startTime); // Start or update timer

    } else { // Tool started but is not currently active and not completed (e.g., history)
        stopToolExecutionTimer(toolCallId); // Ensure timer is stopped
        displayTime = '---'; // Indicate unknown/paused duration
        statusText = toolStartLog.descriptiveText || `${toolStartLog.toolName} started`;
    }


    // --- Generate Inner HTML ---
    // Compact Content (visible part)
    const compactContentHtml = `
        <span class="tool-execution-timer ${isCompleted ? 'final-time' : ''}">${displayTime}</span>
        <span class="tool-name">
            <span class="material-icons" ${iconColorStyle}>${toolIconName}</span>${toolStartLog.toolName || 'Unknown Tool'}
        </span>
        <span class="tool-status-text">${statusText}</span>
        ${statusIconHtml}
        <span class="info-icon"><span class="material-icons">info</span></span>
    `;

    // Details Content (expandable part)
    let argsHtml = '';
    if (toolStartLog.args) {
        try {
            // Stringify nicely, escape potential HTML issues
            const argsString = JSON.stringify(toolStartLog.args, null, 2);
            const escapedArgs = argsString.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            argsHtml = `<div class="tool-args"><strong>Arguments:</strong><pre>${escapedArgs}</pre></div>`;
        } catch (e) {
            argsHtml = '<div class="tool-args"><strong>Arguments:</strong> Error displaying arguments</div>';
        }
    }

    let resultHtml = '';
    if (isCompleted && toolEndLog.result) {
        try {
            // Special handling for command output
            let resultString;
            if (toolEndLog.result.stdout !== undefined || toolEndLog.result.stderr !== undefined) {
                const stdout = toolEndLog.result.stdout?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || 'None';
                const stderr = toolEndLog.result.stderr?.replace(/</g, '&lt;').replace(/>/g, '&gt;') || 'None';
                resultString = `<div class="result-stdout"><strong>stdout:</strong><pre>${stdout}</pre></div>` +
                    `<div class="result-stderr"><strong>stderr:</strong><pre>${stderr}</pre></div>`;
            } else {
                // General JSON result
                resultString = JSON.stringify(toolEndLog.result, null, 2);
                resultString = resultString.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                resultString = `<pre>${resultString}</pre>`;
            }
            resultHtml = `<div class="tool-result"><strong>Result:</strong>${resultString}</div>`;
        } catch (e) {
            resultHtml = '<div class="tool-result"><strong>Result:</strong> Error displaying result</div>';
        }
    } else if (isCompleted && !toolEndLog.result) {
        resultHtml = '<div class="tool-result"><strong>Result:</strong> No result data received.</div>';
    }

    const detailsContentHtml = `
        <div class="tool-timestamp">Start: ${new Date(toolStartLog.timestamp).toLocaleTimeString()}</div>
        ${isCompleted ? `<div class="tool-timestamp">End: ${new Date(toolEndLog.timestamp).toLocaleTimeString()}</div>` : ''}
        ${argsHtml}
        ${resultHtml}
    `;

    // --- Apply to DOM ---
    entryElement.innerHTML = `
        <div class="compact-content">${compactContentHtml}</div>
        <div class="tool-details">${detailsContentHtml}</div>
    `;

    // --- Add Event Listeners ---
    // Always ensure event listeners are attached for all widgets, regardless of how they were created
    const compactContentElement = entryElement.querySelector('.compact-content');
    const infoIconElement = compactContentElement?.querySelector('.info-icon .material-icons');
    if (compactContentElement && infoIconElement) {
        // Remove any existing listeners by replacing the element with a clone
        const clonedContent = compactContentElement.cloneNode(true);
        compactContentElement.replaceWith(clonedContent);
        
        // Get fresh references after cloning
        const newCompactContent = entryElement.querySelector('.compact-content');
        const newInfoIcon = newCompactContent.querySelector('.info-icon .material-icons');
        
        // Add the click event listener
        newCompactContent.addEventListener('click', (e) => {
            // Prevent toggle if clicking inside the <pre> tags for selection
            if (e.target.closest('pre, code, button')) return;
            entryElement.classList.toggle('expanded');
            newInfoIcon.textContent = entryElement.classList.contains('expanded') ? 'expand_less' : 'info';
        });
    }
    
    // Trigger fade-in animation only for new entries
    if (isNewEntry) {
        setTimeout(() => entryElement.classList.remove('new-entry'), 10); // Small delay ensures transition works
    }

    // Update timer element reference if it exists in widgetData
    const timerElement = entryElement.querySelector('.tool-execution-timer');
    if (timerElement) {
        widgetData.timerElement = timerElement;
    }
}


/**
 * Starts or updates the interval timer for an active tool execution widget.
 * @param {string} toolCallId - The ID of the tool call.
 * @param {number} startTime - The timestamp when the tool/state started.
 */
function startToolExecutionTimer(toolCallId, startTime) {
    let widgetData = activeToolWidgets.get(toolCallId);
    if (!widgetData) return; // Should not happen if called from renderOrUpdate

    // Clear existing interval if any
    if (widgetData.intervalId) {
        clearInterval(widgetData.intervalId);
    }

    widgetData.startTime = startTime; // Ensure start time is stored

    // Start new interval
    widgetData.intervalId = setInterval(() => {
        const currentWidgetData = activeToolWidgets.get(toolCallId); // Re-fetch in case it was removed
        if (!currentWidgetData || !currentWidgetData.element || !currentWidgetData.element.isConnected) {
            // Widget removed from DOM, clear interval
            stopToolExecutionTimer(toolCallId);
            return;
        }
        if (currentWidgetData.startTime && currentWidgetData.timerElement) {
            const elapsedMs = Date.now() - currentWidgetData.startTime;
            updateTimerDisplay(currentWidgetData.timerElement, elapsedMs); // Update the timer element
        }
    }, 100); // Update frequently for smooth display

    // Initial update
    if (widgetData.startTime && widgetData.timerElement) {
        const elapsedMs = Date.now() - widgetData.startTime;
        updateTimerDisplay(widgetData.timerElement, elapsedMs);
    }
}

/**
 * Stops the interval timer for a tool execution widget.
 * @param {string} toolCallId - The ID of the tool call.
 */
function stopToolExecutionTimer(toolCallId) {
    let widgetData = activeToolWidgets.get(toolCallId);
    if (widgetData && widgetData.intervalId) {
        clearInterval(widgetData.intervalId);
        widgetData.intervalId = null; // Clear the interval ID
        // Optionally update final time one last time if needed, though renderOrUpdate handles this
        // if(widgetData.startTime && widgetData.timerElement) {
        //     const elapsedMs = Date.now() - widgetData.startTime;
        //     updateTimerDisplay(widgetData.timerElement, elapsedMs);
        // }
    }
    // Also clear from the separate toolTimers map if it was used
    if (toolTimers.has(toolCallId)) {
        clearInterval(toolTimers.get(toolCallId).intervalId);
        toolTimers.delete(toolCallId);
    }
}

/**
 * Shows or updates the 'Thinking...' indicator widget.
 * @param {string} [gerundText='Thinking'] - Text to display (currently ignored, always shows 'Thinking').
 * @param {number} [startTime=Date.now()] - Timestamp when the thinking state started.
 */
export function showThinkingWidget(gerundText = 'Thinking', startTime = Date.now()) {
    if (!toolLogContainer) return;

    // If widget exists, just ensure timer is running correctly
    if (thinkingWidgetElement) {
        // Restart timer if start time is different or timer not running
        if (!thinkingTimerIntervalId) {
            startThinkingTimer(startTime);
        }
        return; // Don't recreate if it exists
    }

    // Create new thinking widget
    thinkingWidgetElement = document.createElement('div');
    thinkingWidgetElement.className = 'thinking-widget new-entry'; // Add animation class

    const timerElement = document.createElement('span');
    timerElement.className = 'tool-execution-timer';
    thinkingWidgetElement.appendChild(timerElement);

    const iconElement = document.createElement('span');
    iconElement.className = 'material-icons';
    iconElement.textContent = toolIconMap['thinking']; // Use icon from map
    thinkingWidgetElement.appendChild(iconElement);

    const textElement = document.createElement('span');
    textElement.className = 'thinking-text';
    textElement.textContent = 'Thinking'; // Always display "Thinking" for consistency
    const dotsElement = document.createElement('span');
    dotsElement.className = 'thinking-dots';
    dotsElement.innerHTML = '<span>.</span><span>.</span><span>.</span>'; // Animated dots
    textElement.appendChild(dotsElement);
    thinkingWidgetElement.appendChild(textElement);

    toolLogContainer.prepend(thinkingWidgetElement); // Add to top of log

    // Start the timer
    startThinkingTimer(startTime);

    // Trigger animation
    setTimeout(() => thinkingWidgetElement?.classList.remove('new-entry'), 10);
}

/** Starts the interval timer for the thinking widget */
function startThinkingTimer(startTime) {
    if (thinkingTimerIntervalId) {
        clearInterval(thinkingTimerIntervalId); // Clear existing if any
    }
    const timerElement = thinkingWidgetElement?.querySelector('.tool-execution-timer');
    if (!timerElement) return;

    thinkingTimerIntervalId = setInterval(() => {
        if (!thinkingWidgetElement || !thinkingWidgetElement.isConnected) {
            removeThinkingWidget(); // Clean up if element is gone
            return;
        }
        const elapsedMs = Date.now() - startTime;
        updateTimerDisplay(timerElement, elapsedMs);
    }, 100);

    // Initial display
    const initialElapsedMs = Date.now() - startTime;
    updateTimerDisplay(timerElement, initialElapsedMs);
}


/**
 * Removes the 'Thinking...' indicator widget from the UI.
 */
export function removeThinkingWidget() {
    if (thinkingTimerIntervalId) {
        clearInterval(thinkingTimerIntervalId);
        thinkingTimerIntervalId = null;
    }
    if (thinkingWidgetElement) {
        thinkingWidgetElement.remove();
        thinkingWidgetElement = null;
    }
}

/**
 * Clears all entries and timers from the tool log display.
 */
export function clearLogs() {
    if (!toolLogContainer) return;

    // Stop all active timers
    activeToolWidgets.forEach((widgetData, toolCallId) => {
        stopToolExecutionTimer(toolCallId);
    });
    toolTimers.forEach((timerInfo, toolCallId) => { // Also clear the separate map if used
        clearInterval(timerInfo.intervalId);
    });


    // Clear internal state maps
    activeToolWidgets.clear();
    toolTimers.clear(); // Clear the separate map if used

    // Remove thinking widget if present
    removeThinkingWidget();

    // Clear DOM content
    toolLogContainer.innerHTML = '';
    console.log("Tool log cleared.");
}

// --- Functions below might be deprecated if using agent_state_update and renderOrUpdateToolWidget ---
// Functions like handleAgentUpdate, addToolLogEntry, bash checks are superseded by
// the unified renderOrUpdateToolWidget logic driven by socket events (tool_log_append, agent_state_update).
// Keeping them commented out for reference in case specific logic needs to be reintegrated.
/*
export function handleAgentUpdate(update) {
    // ... logic from original file ...
    // This should now mostly be handled by the socket event handlers
    // calling renderOrUpdateToolWidget or showThinkingWidget directly.
    // Specific non-widget updates (like token count) are handled in socket.js.
}

function addToolLogEntry(...) { // Deprecated by renderOrUpdateToolWidget
    // ... old logic ...
}
function startToolExecutionTimer_Legacy(...) { // Deprecated
    // ... old logic ...
}
function stopToolExecutionTimer_Legacy(...) { // Deprecated
    // ... old logic ...
}
*/
// --- End Deprecated Section ---