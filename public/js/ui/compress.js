// public/js/ui/compress.js

import { appState } from '../state.js';
import { setStatus } from './status.js';
import { showConfirmationModal } from '../utils.js';
import { enableChatInput, clearMessages } from './chat.js';

// DOM Elements for the compress feature
const compressButton = document.getElementById('compress-button');

/**
 * Sets the compression state
 * @param {boolean} isCompressing - Whether compression is active
 * @param {string|null} sessionId - The session ID being compressed
 */
export function setCompressionState(isCompressing, sessionId = null) {
    appState.compressionState = {
        isCompressing,
        sessionId,
        startTime: isCompressing ? Date.now() : null
    };
    
    // Update UI and other states
    updateCompressionUI();
}

/**
 * Updates the compression button UI state and controls input availability
 */
function updateCompressionUI() {
    if (!compressButton) return;
    
    const { isCompressing, sessionId } = appState.compressionState;
    
    // Update button appearance
    compressButton.disabled = isCompressing;
    compressButton.classList.toggle('compressing', isCompressing);
    
    if (isCompressing) {
        // Save original HTML content and replace with spinner icon
        compressButton.dataset.originalHtml = compressButton.innerHTML;
        compressButton.innerHTML = '<span class="material-icons spin">sync</span>';

        // Update tooltip content
        compressButton.title = "Compressing...";
        if (compressButton._tippy) {
            compressButton._tippy.setContent("Compressing...");
        }

        // Disable chat input if compression is happening in current session
        if (sessionId === appState.currentSessionId) {
            enableChatInput(false);
        }
    } else {
        // Restore original button content
        if (compressButton.dataset.originalHtml) {
            compressButton.innerHTML = compressButton.dataset.originalHtml;
            delete compressButton.dataset.originalHtml;
        } else {
            compressButton.innerHTML = '<span class="material-icons">compress</span>';
        }

        // Update tooltip content
        compressButton.title = "Compress";
        if (compressButton._tippy) {
            compressButton._tippy.setContent("Compress");
        }

        // Enable chat input if we're in the current session
        if (sessionId === appState.currentSessionId) {
            enableChatInput(true);
        }
    }
}

/**
 * Reloads the chat UI to display the compressed conversation
 */
function reloadChatUI() {
    // Clear the existing messages display
    clearMessages();
    
    // Dispatch a custom event to notify that history has changed
    const event = new CustomEvent('history-changed', {
        detail: { sessionId: appState.currentSessionId }
    });
    window.dispatchEvent(event);
}

/**
 * Initializes the compress button functionality
 */
export function initCompressButton() {
    if (!compressButton) {
        console.warn("Compress button not found, skipping initialization.");
        return;
    }

    // Add click event listener to the compress button
    compressButton.addEventListener('click', async () => {
        // Get the current session name for the confirmation message
        const sessionName = appState.currentSession?.name || 'current session';
        
        // Check if already compressing - either this session or another
        if (appState.compressionState.isCompressing) {
            if (appState.compressionState.sessionId === appState.currentSessionId) {
                console.warn("Already compressing this session");
                return;
            } else {
                console.warn(`Already compressing another session (${appState.compressionState.sessionId})`);
                alert("Another session is currently being compressed. Please wait for it to finish.");
                return;
            }
        }
        
        const confirmed = await showConfirmationModal({
            title: 'Compress Session Data',
            message: `Are you sure you want to compress data for session "${sessionName}"?`,
            itemName: 'This will compress the conversation',
            confirmText: 'Compress',
            confirmVariant: 'primary',
        });
        
        if (confirmed) {
            const sessionId = appState.currentSessionId;
            if (!sessionId) {
                console.error('No current session ID found for compression');
                return;
            }
            
            try {
                // Set compression state
                setCompressionState(true, sessionId);
                setStatus('thinking', `Compressing session ${sessionName}...`);
                
                // Call the compression API endpoint
                const response = await fetch(`/api/compression/${sessionId}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                
                const result = await response.json();
                console.log('Compression result:', result);
                
                if (result.success) {
                    // Show success notification
                    setStatus('idle', 'Compression completed');
                    
                    // Reload chat UI if needed
                    if (result.shouldReloadChat) {
                        reloadChatUI();
                    }
                } else {
                    // Handle the case where compression wasn't needed or didn't happen
                    if (result.shouldReactivateButton) {
                        setStatus('idle', 'Not enough conversation history');
                    } else {
                        setStatus('idle', result.message || 'Compression skipped');
                    }
                }
                
            } catch (error) {
                console.error('Error compressing session:', error);
                setStatus('error', 'Compression failed');
            } finally {
                // Reset compression state
                setCompressionState(false);
            }
        } else {
            console.log("Session compression cancelled by user.");
        }
    });
    
    // Initialize the button state
    updateCompressionUI();

    console.log("Compress button initialized.");
}

/**
 * Check if a session can be compressed
 * @param {string} sessionId - The session ID to check
 * @returns {boolean} - Whether the session can be compressed
 */
export function canCompress(sessionId) {
    // Don't allow compression if any session is being compressed
    return !appState.compressionState.isCompressing;
}

// Add a listener for session changes to update UI when switching sessions
document.addEventListener('DOMContentLoaded', () => {
    window.addEventListener('session-changed', (event) => {
        // Update the compress button state based on the new session
        if (appState.compressionState.isCompressing) {
            // If current session is being compressed, disable input
            if (appState.compressionState.sessionId === appState.currentSessionId) {
                enableChatInput(false);
            } else {
                enableChatInput(true);
            }
        }
    });
});