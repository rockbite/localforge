// src/ui/workspace.js
// Purpose: Manage the working directory display and the setup modal logic.

import { appState } from '../state.js';
import * as api from '../api.js';
import { emitSetupWorkspace } from '../socket.js'; // Only need the emitter
import { addAgentMessage } from './chat.js'; // For user feedback

// DOM Elements specific to workspace
const setupModal = document.getElementById('setup-modal');
const directoryForm = document.getElementById('directory-form');
const directoryInput = document.getElementById('directory-input');
const directoryCancelButton = document.getElementById('directory-cancel');
const workingDirDisplay = document.getElementById('working-dir');

/**
 * Initializes the workspace setup UI elements and listeners.
 */
export function initWorkspaceSetup() {
    if (!workingDirDisplay) {
        console.warn("Working directory display element ('working-dir') not found.");
        return; // Can't initialize without the display element
    }

    // Make the working directory display clickable to open the modal
    workingDirDisplay.style.cursor = 'pointer';
    workingDirDisplay.onclick = showDirectoryModal; // Use the exported function

    // Setup listeners for the modal form
    setupDirectoryFormListener();

    console.log("Workspace setup initialized.");
}

/**
 * Displays the working directory setup modal.
 */
export function showDirectoryModal() {
    if (setupModal) {
        setupModal.classList.add('active');
        if (directoryInput) {
            directoryInput.value = appState.workingDirectory || ''; // Pre-fill current value
            // Small delay ensures focus works after modal transition/display update
            setTimeout(() => directoryInput.focus(), 50);
        }
    } else {
        console.warn("Setup modal element ('setup-modal') not found.");
    }
}


/**
 * Sets up event listeners for the directory selection modal form.
 */
function setupDirectoryFormListener() { // Keep as internal helper, called by init
    if (!directoryForm || !setupModal || !directoryCancelButton || !directoryInput) {
        console.warn("Directory modal form elements not found, skipping listener setup.");
        return;
    }

    // Cancel button closes the modal
    directoryCancelButton.addEventListener('click', () => {
        setupModal.classList.remove('active');
    });

    // Form submission handler
    directoryForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const directory = directoryInput.value.trim();
        const directoryToSet = directory === '' ? null : directory;

        appState.workingDirectory = directoryToSet;
        setWorkingDirectoryDisplay(directoryToSet);
        setupModal.classList.remove('active');

        try {
            await api.saveWorkingDirectory(appState.currentSessionId, directoryToSet);
            console.log("Working directory saved to session data.");
        } catch (error) {
            alert(`Error saving working directory preference: ${error.message}`);
        }

        if (appState.socket) {
            emitSetupWorkspace(appState.socket, directoryToSet);
            if (directoryToSet) {
                addAgentMessage(`Working directory set to: \`${directoryToSet}\``);
            } else {
                addAgentMessage("Working directory has been unset. File access tools will be limited.");
            }
        } else {
            console.warn("Socket not available to emit setup_workspace.");
        }
    });

    // console.log("Directory form listener set up."); // Less noisy log
}

/**
 * Updates the UI element displaying the current working directory.
 * @param {string | null} directory - The directory path to display, or null.
 */
export function setWorkingDirectoryDisplay(directory) {
    if (!workingDirDisplay) return;

    if (directory) {
        const displayPath = directory.length > 30 ? '...' + directory.substring(directory.length - 30) : directory;
        workingDirDisplay.innerHTML =
            `<span class="material-icons">folder</span><span title="${directory}">${displayPath}</span>` +
            `<span class="material-icons edit-icon" title="Change working directory">edit</span>`;
    } else {
        workingDirDisplay.innerHTML =
            `<span class="material-icons">folder_off</span><span>No directory set</span>` +
            `<span class="material-icons add-icon" title="Set working directory">add_circle</span>`;
    }
}