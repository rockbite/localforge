// src/main.js
// Purpose: Main entry point for the frontend application. Orchestrates initialization.

import { appState } from './state.js';
import * as api from './api.js';
import * as socket from './socket.js';
import * as projectUI from './ui/projects.js';
import * as chatUI from './ui/chat.js';
import * as toolLogUI from './ui/toolLog.js';
import * as settingsUI from './ui/settings.js';
import * as workspaceUI from './ui/workspace.js';
import * as layoutUI from './ui/layout.js';
import { setStatus } from './ui/status.js'; // Direct import for initial status

// Assume external libraries (marked, Prism) are loaded globally

/**
 * Initializes the update notification system by connecting Electron IPC with Socket.IO
 */
async function initUpdateNotifications() {
    // Import the utility function
    const { isElectronEnvironment } = await import('./utils.js');
    
    // Check if we're running in Electron
    if (isElectronEnvironment()) {
        console.log('Initializing update notification system');
        
        // Listen for update notifications from Electron main process
        window.electronAPI.onUpdateAvailable((data) => {
            console.log('Update available from Electron main process:', data);
            
            // Forward to Socket.IO server to broadcast to all clients
            if (appState.socket && appState.socket.connected) {
                appState.socket.emit('relay_update_available', data);
            } else {
                // If socket not connected, just show the notification directly
                const event = new CustomEvent('update_available', { detail: data });
                document.dispatchEvent(event);
            }
        });
        
        // Also listen for update_available events from the socket or custom event
        document.addEventListener('update_available', (event) => {
            const data = event.detail;
            if (data && data.current && data.latest) {
                console.log('Creating update notification from custom event');
                // UI notification is handled by socket.js
            }
        });
    } else {
        console.log('Not running in Electron, update notification system not initialized');
    }
}

/**
 * Initializes the entire application.
 */
async function initializeApp() {
    console.log("Initializing application...");
    appState.isLoading = true;
    // Note: Loading indicator is handled by layoutUI.hideLoading

    try {
        // 1. Fetch initial project and session data
        console.log("Fetching initial data...");
        const initialData = await api.fetchProjectsAndSessionIds();
        appState.projects = initialData.projects;
        appState.currentProjectId = initialData.currentProjectId;
        appState.currentSessionId = initialData.currentSessionId;
        console.log("Initial project data loaded.");

        // 2. Fetch details for the current session if IDs exist
        if (appState.currentProjectId && appState.currentSessionId) {
            console.log(`Workspaceing details for session: ${appState.currentSessionId}`);
            try {
                const sessionData = await api.fetchSessionDetails(appState.currentSessionId);
                if (sessionData) {
                    appState.currentSession = sessionData;
                    appState.workingDirectory = sessionData.data?.workingDirectory || null;
                    appState.agentId = sessionData.data?.agentId || null;
                    console.log("Initial session details loaded.");
                } else {
                    console.warn(`Current session ${appState.currentSessionId} details not found. Might have been deleted.`);
                    // Reset IDs if session is gone? Or let backend handle invalid session on join?
                    // For now, proceed with potentially invalid IDs, socket join will fail.
                    appState.workingDirectory = null;
                    appState.agentId = null;
                }
                appState.currentProject = appState.projects.find(p => p.id === appState.currentProjectId) || null;

            } catch (error) {
                console.error('Error fetching initial session details:', error);
                // Proceed without session details, might affect initial WD display
                appState.currentProject = appState.projects.find(p => p.id === appState.currentProjectId) || null;
                appState.workingDirectory = null;
            }
        } else {
            console.log("No current project/session ID found in initial data. Backend default expected.");
            appState.workingDirectory = null; // Assume null WD if no session
        }

        // 3. Initialize UI Components
        console.log("Initializing UI components...");
        await projectUI.renderProjectsList(); // Render project list first (await if it becomes async)
        workspaceUI.setWorkingDirectoryDisplay(appState.workingDirectory); // Set initial WD display
        layoutUI.initDragBar();           // Setup layout adjustments
        projectUI.initProjectUI();        // Setup project list interactions/menus
        chatUI.initChatForm();          // Setup message input form
        toolLogUI.initToolLog();          // Prepare tool log area
        // Settings UI is now initialized automatically in the module
        workspaceUI.initWorkspaceSetup();   // Setup WD display click/modal form
        
        // Load agents list for the agent selector dropdown
        const { loadAgentsList } = await import('./utils.js');
        loadAgentsList();
        
        // Initialize chat context view
        const { initChatContextView } = await import('./ui/chat-context.js');
        initChatContextView();
        
        // Initialize global ESC key handler for modals
        const { initGlobalModalEscHandler } = await import('./utils.js');
        initGlobalModalEscHandler();
        console.log("UI components initialized.");

        // 4. Initialize WebSocket connection
        console.log("Initializing WebSocket...");
        socket.initializeSocket(); // Socket 'connect' handler will trigger 'join_session'

        // 5. Mark as initialized and hide loading screen
        appState.isInitialized = true;
        appState.isLoading = false;
        layoutUI.hideLoading();

        // Set initial status (might be quickly overwritten by socket connect/join)
        setStatus('connecting', 'Initializing...');
        
        // Initialize update notification system
        initUpdateNotifications();

        console.log("Application initialized successfully.");

    } catch (error) {
        console.error('FATAL: Error initializing application:', error);
        appState.isLoading = false;
        // Display prominent error message
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.innerHTML = `
                <div class="loading-content">
                    <div class="loading-icon error">⚠️</div>
                    <div class="loading-text error-text">Application Error</div>
                    <div class="loading-subtext">${error.message}.<br/>Please check the console and refresh the page.</div>
                </div>`;
            loadingScreen.style.opacity = '1';
            loadingScreen.style.display = 'flex'; // Ensure it's visible
        } else {
            document.body.innerHTML = `<h1>Application Error</h1><p>${error.message}. Please refresh.</p>`;
        }
        // Optionally hide the main content if it partially loaded
        const mainContent = document.getElementById('main-content');
        if(mainContent) mainContent.style.opacity = '0';
    }
}

// Start the application once the DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);