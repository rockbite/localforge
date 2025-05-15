// public/js/ui/compress.js

import { appState } from '../state.js';
import { setStatus } from './status.js';
import { showConfirmationModal } from '../utils.js';
import { enableChatInput, clearMessages } from './chat.js';

// DOM Element for the compress button
const compressButton = document.getElementById('compress-button');

/* -------------------------------------------------- *
 * helpers                                            *
 * -------------------------------------------------- */
// true ⟺ **any** session is currently compressing
export function anySessionCompressing() {
  return Object.values(appState.compressionStates)
               .some(s => s.isCompressing);
}

/**
 * Sets the compression state for a specific session
 * @param {string} sessionId - The session ID being compressed
 * @param {boolean} isCompressing - Whether compression is active
 */
export function setSessionCompressionState(sessionId, isCompressing) {
  if (isCompressing) {
    // Add or update compression state for this session
    appState.compressionStates[sessionId] = {
      isCompressing: true,
      startTime: Date.now()
    };
  } else {
    // Remove compression state for this session
    delete appState.compressionStates[sessionId];
  }

  // Broadcast change so every tab / component can react
  window.dispatchEvent(new Event('compression-state-changed'));
}

/**
 * Checks if a specific session is being compressed
 * @param {string} sessionId - The session ID to check
 * @returns {boolean} - Whether the session is being compressed
 */
export function isSessionCompressing(sessionId) {
  return !!(appState.compressionStates[sessionId]?.isCompressing);
}

/**
 * Updates the compression button UI state and controls input availability
 * Shows spinner only for the current session if it's compressing
 */
export function updateCompressionUI() {
  if (!compressButton) return;

  const currentSessionId = appState.currentSessionId;

  // Check if current session is compressing
  const isCurrentSessionCompressing = isSessionCompressing(currentSessionId);
  const isAnyCompression            = anySessionCompressing();

  // Check if the agent is busy (agent state is separate from compression)
  const isAgentBusy = appState.isAgentResponding ||
                     (appState.currentAgentState?.status !== 'idle' &&
                      appState.currentAgentState?.status !== undefined);

  /* ---------- button ---------- */
  compressButton.disabled = isCurrentSessionCompressing || isAgentBusy;
  compressButton.classList.toggle('disabled', compressButton.disabled);
  compressButton.classList.toggle('compressing', isCurrentSessionCompressing);
  
  // Update button appearance
  if (isCurrentSessionCompressing) {
    // Show spinner when current session is compressing
    compressButton.innerHTML = '<span class="material-icons spin">sync</span>';
    
    // Update tooltip content
    compressButton.title = "Compressing...";
    if (compressButton._tippy) {
      compressButton._tippy.setContent("Compressing...");
    }
  } else {
    // Normal button state
    compressButton.innerHTML = '<span class="material-icons">compress</span>';
    
    // Update tooltip based on button state
    if (isAgentBusy) {
      compressButton.title = "Cannot compress while agent is busy";
      if (compressButton._tippy) {
        compressButton._tippy.setContent("Cannot compress while agent is busy");
      }
    } else {
      compressButton.title = "Compress";
      if (compressButton._tippy) {
        compressButton._tippy.setContent("Compress");
      }
    }
  }
  
  /* ---------- chat input ---------- */
  // lock the input if current session is compressing, or the agent is busy
  enableChatInput(!(isCurrentSessionCompressing || isAgentBusy));
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
export async function initCompressButton() {
  if (!compressButton) {
    console.warn("Compress button not found, skipping initialization.");
    return;
  }
  
  // Check current session compression status on load
  if (appState.currentSessionId) {
    try {
      const response = await fetch(`/api/compression/status/${appState.currentSessionId}`);
      const data = await response.json();
      
      if (data.compressing) {
        // If session is already compressing (from a previous page load), update state
        setSessionCompressionState(appState.currentSessionId, true);
      }
    } catch (error) {
      console.error('Error checking compression status:', error);
    }
  }

  // Add click event listener to the compress button
  compressButton.addEventListener('click', async () => {
    const sessionId = appState.currentSessionId;
    const sessionName = appState.currentSession?.name || 'current session';
    
    // Check if current session is already compressing
    if (isSessionCompressing(sessionId)) {
      console.warn("Already compressing this session");
      return;
    }
    
    // Check if agent is busy
    if (appState.isAgentResponding || 
       (appState.currentAgentState?.status !== 'idle' && 
        appState.currentAgentState?.status !== undefined)) {
      console.warn("Cannot compress while agent is busy");
      return;
    }
    
    // Ask for confirmation before compressing
    const confirmed = await showConfirmationModal({
      title: 'Compress Session Data',
      message: `Are you sure you want to compress data for session "${sessionName}"?`,
      confirmText: 'Compress',
      confirmVariant: 'primary',
    });
    
    if (confirmed) {
      try {
        // Set compression state for this session
        setSessionCompressionState(sessionId, true);
        setStatus('thinking', `Compressing session ${sessionName}...`);

        console.log('Compress action confirmed, sending to backend');

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
        // Reset compression state for this session
        setSessionCompressionState(sessionId, false);
      }
    } else {
      console.log("Session compression cancelled by user.");
    }
  });
  
  // Initialize the button state
  updateCompressionUI();

  // React to *all* state-change events that matter
  window.addEventListener('session-changed',           updateCompressionUI);
  window.addEventListener('compression-state-changed', updateCompressionUI);
  window.addEventListener('agent-status-changed',      updateCompressionUI);

  console.log("Compress button initialized.");
}

/**
 * Check if a session can be compressed
 * @param {string} sessionId - The session ID to check
 * @returns {boolean} - Whether the session can be compressed
 */
export function canCompress(sessionId) {
  // A session can be compressed if:
  // 1. It's not already being compressed
  // 2. The agent is not busy for this session (only relevant if it's the current session)
  const isAgentBusy = sessionId === appState.currentSessionId && 
                      (appState.isAgentResponding || 
                       appState.currentAgentState?.status !== 'idle');
  
  return !isSessionCompressing(sessionId) && !isAgentBusy;
}