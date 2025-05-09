// src/ui/compress.js
// Purpose: Handle the compress button functionality and API interaction

import { appState } from '../state.js';
import { setStatus } from './status.js';
import { showConfirmationModal } from '../utils.js';

// DOM Elements for the compress feature
const compressButton = document.getElementById('compress-button');

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
                
                // Show success notification
                setStatus('idle', 'Compression completed');
                alert('Compression completed successfully.');
                
            } catch (error) {
                console.error('Error compressing session:', error);
                alert(`Error compressing session: ${error.message}`);
                setStatus('error', 'Compression failed');
            }
        } else {
            console.log("Session compression cancelled by user.");
        }
    });

    console.log("Compress button initialized.");
}