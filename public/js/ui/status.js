// src/ui/status.js
// Purpose: Manages the UI status indicator (dot and text).

import { appState } from '../state.js';
import { enableChatInput } from './chat.js'; // To enable/disable input based on status

// DOM Elements for status
const statusDot = document.getElementById('status-dot');
const statusTextElement = document.getElementById('status-text'); // Renamed from statusText for clarity

/**
 * Updates the UI status indicator (dot color and text).
 * Also enables/disables chat input based on status.
 * @param {'idle' | 'thinking' | 'active' | 'error' | 'connecting' | 'disconnected'} status - The status type.
 * @param {string | null} [customText=null] - Optional text to display instead of default.
 */
export function setStatus(status, customText = null) {
    if (!statusDot || !statusTextElement) {
        console.warn("Status elements (dot or text) not found.");
        return;
    }

    statusDot.className = 'status-dot'; // Reset classes
    statusDot.classList.add(status); // Add the new status class for color

    let displayText = '';
    let isIdle = false;

    switch (status) {
        case 'idle':
            displayText = customText || 'Idle';
            isIdle = true;
            break;
        case 'thinking':
            // Use gerund from state if available and no custom text provided
            displayText = customText || `${appState.currentGerund || 'Thinking'}...`;
            isIdle = false;
            break;
        case 'active': // General 'working' state if not 'thinking' or 'tool_running'
            displayText = customText || 'Working...';
            isIdle = false;
            break;
        case 'tool_running': // Specific status from agent state
            displayText = customText || 'Running tool...';
            isIdle = false;
            break;
        case 'connecting':
            displayText = customText || 'Connecting...';
            isIdle = false;
            break;
        case 'disconnected':
            displayText = customText || 'Disconnected';
            isIdle = false; // Treat as non-idle for input purposes
            break;
        case 'error':
            displayText = customText || 'Error';
            isIdle = true; // Allow input even on error, unless explicitly disabled elsewhere
            break;
        default:
            displayText = customText || status; // Display unknown status as text
            isIdle = false; // Assume non-idle for unknown status
    }

    statusTextElement.textContent = displayText;

    // Update appState's view of agent responsiveness (used by old code, maybe remove later)
    appState.isAgentResponding = !isIdle;

    // Dispatch event to notify other components of the status change
    window.dispatchEvent(new Event('agent-status-changed'));

    // Enable/disable chat based on whether the status implies the agent is busy
    enableChatInput(isIdle);

    // console.log(`Status set to: ${status} - ${displayText}`);
}