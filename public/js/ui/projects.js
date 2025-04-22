// src/ui/projects.js
// Purpose: Handle the UI related to projects and sessions list in the sidebar.

import { appState } from '../state.js';
import * as api from '../api.js';
import { emitJoinSession } from '../socket.js';
import { setStatus } from './status.js';
import { clearMessages, enableChatInput, updateChatHeader } from './chat.js'; // Added updateChatHeader import
import { clearLogs as clearToolLogs } from './toolLog.js';
import { setWorkingDirectoryDisplay } from './workspace.js';

// Flags to track if we're currently showing a temporary project or session creation item
let isAddingProject = false;
let isAddingSession = false;


// DOM Elements specific to projects/sessions
const projectsListContainer = document.getElementById('projects-list');
const projectContextMenu = document.getElementById('project-context-menu');
const sessionContextMenu = document.getElementById('session-context-menu');

// --- Module Scope Variable ---
// Tracks the currently open context menu (project or session) to handle closing logic.
let activeContextMenu = null;

/**
 * Shows a confirmation modal using Shoelace dialog.
 * @param {object} options - Configuration options.
 * @param {string} [options.title='Confirm Action'] - The title for the dialog.
 * @param {string} options.message - The main confirmation message.
 * @param {string} [options.itemName=''] - The specific item name (e.g., project/session name) to display.
 * @param {string} [options.confirmText='Confirm'] - Text for the confirmation button.
 * @param {'primary' | 'success' | 'neutral' | 'warning' | 'danger' | 'text'} [options.confirmVariant='danger'] - Shoelace variant for the confirm button.
 * @param {string} [options.cancelText='Cancel'] - Text for the cancel button.
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if canceled.
 */
function showConfirmationModal({
    title = 'Confirm Action',
    message,
    itemName = '',
    confirmText = 'Confirm',
    confirmVariant = 'danger',
    cancelText = 'Cancel'
}) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirmation-dialog');
        const messageEl = document.getElementById('confirmation-message');
        const itemNameEl = document.getElementById('confirmation-item-name');
        const confirmButton = dialog.querySelector('.confirm-button');
        const cancelButton = dialog.querySelector('.cancel-button');

        if (!dialog || !messageEl || !itemNameEl || !confirmButton || !cancelButton) {
            console.error('Confirmation dialog elements not found!');
            // Fallback to browser confirm if modal elements are missing
            resolve(window.confirm(`${message}${itemName ? `\n\nItem: ${itemName}` : ''}` ));
            return;
        }

        // Update dialog content
        dialog.label = title;
        messageEl.textContent = message;
        itemNameEl.textContent = itemName;
        itemNameEl.style.display = itemName ? 'block' : 'none'; // Show only if itemName is provided

        // Update buttons
        confirmButton.textContent = confirmText;
        confirmButton.variant = confirmVariant;
        cancelButton.textContent = cancelText;

        // --- Event Handling ---
        // Function to run when confirmed
        const onConfirm = () => {
            cleanup();
            resolve(true);
            dialog.hide();
        };

        // Function to run when canceled
        const onCancel = () => {
            cleanup();
            resolve(false);
            dialog.hide(); // Ensure dialog hides on cancel click too
        };

        // Function to cleanup listeners
        const cleanup = () => {
            confirmButton.removeEventListener('click', onConfirm);
            cancelButton.removeEventListener('click', onCancel);
            // Also listen for Shoelace's hide event to handle closing via Esc or overlay click
            dialog.removeEventListener('sl-hide', onCancelOnHide); 
        };

        // Handler specifically for sl-hide event
        const onCancelOnHide = (event) => {
            // Only resolve(false) if the hide wasn't triggered by clicking confirm/cancel buttons
            // (Those cases are handled by onConfirm/onCancel already)
            if (event.target === dialog) { // Make sure it's the dialog hiding
                cleanup(); // Ensure cleanup happens regardless
                resolve(false);
            }
        };

        // Remove any previous listeners (important!) and add new ones
        confirmButton.addEventListener('click', onConfirm);
        cancelButton.addEventListener('click', onCancel);
        dialog.addEventListener('sl-hide', onCancelOnHide);

        // Show the dialog
        dialog.show();
    });
}

/**
 * Initializes the project/session UI elements and context menus.
 */
export function initProjectUI() {
    if (!projectsListContainer) {
        console.warn("Projects list container ('projects-list') not found.");
        return;
    }
    // Context menus are initialized within initProjectMenus
    initProjectMenus();
    
    // Initialize the add project button
    const addProjectBtn = document.getElementById('add-project-btn');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', handleAddProject);
    }
    
    console.log("Project UI initialized.");
    // Initial render is called from main.js after data fetch
}

/**
 * Handles the add project button click, creating a temporary editable project item.
 */
function handleAddProject() {
    // If we're already adding a project, don't add another one
    if (isAddingProject) return;
    
    isAddingProject = true;
    
    // Create a temporary project item
    const tempProjectItem = document.createElement('div');
    tempProjectItem.className = 'project-item temp-project';
    tempProjectItem.dataset.projectId = 'temp';
    
    tempProjectItem.innerHTML = `
        <div class="project-info">
            <span class="material-icons toggle-icon">keyboard_arrow_right</span>
            <span class="project-name">New Project</span>
        </div>
    `;
    
    // Insert at the top of the list
    if (projectsListContainer.firstChild) {
        projectsListContainer.insertBefore(tempProjectItem, projectsListContainer.firstChild);
    } else {
        projectsListContainer.appendChild(tempProjectItem);
    }
    
    // Make the project name editable
    const projectNameEl = tempProjectItem.querySelector('.project-name');
    if (projectNameEl) {
        // Make the name editable
        projectNameEl.contentEditable = true;
        projectNameEl.focus();
        // Select all text
        window.getSelection().selectAllChildren(projectNameEl);
        
        // Handle saving when done editing
        const createNewProject = async () => {
            projectNameEl.contentEditable = false;
            const projectName = projectNameEl.textContent.trim();
            
            if (projectName) {
                try {
                    // Show a loading state
                    tempProjectItem.classList.add('creating');
                    projectNameEl.textContent = 'Creating...';
                    
                    // Create the project
                    const newProject = await api.createProject(projectName);
                    
                    // Remove the temporary item
                    if (tempProjectItem.parentNode) {
                        tempProjectItem.parentNode.removeChild(tempProjectItem);
                    }
                    
                    // Fetch the latest projects & current IDs from the API - this will also get
                    // the new project and its automatically created session
                    try {
                        const freshData = await api.fetchProjectsAndSessionIds();
                        
                        // Update entire app state with the latest data
                        if (freshData) {
                            if (Array.isArray(freshData.projects)) {
                                appState.projects = freshData.projects;
                            }
                            if (freshData.currentProjectId) {
                                appState.currentProjectId = freshData.currentProjectId;
                            }
                            if (freshData.currentSessionId) {
                                appState.currentSessionId = freshData.currentSessionId;
                            }
                        }
                    } catch (error) {
                        console.error('Error refreshing data after project creation:', error);
                    }
                    
                    // Just render the projects list - the current project will be automatically expanded
                    // and the current session will be selected due to our centralized rendering logic
                    await renderProjectsList();
                } catch (error) {
                    console.error('Error creating project:', error);
                    tempProjectItem.classList.remove('creating');
                    projectNameEl.textContent = 'Error: ' + (error.message || 'Failed to create project');
                    
                    // Remove the error message after a delay
                    setTimeout(() => {
                        if (tempProjectItem.parentNode) {
                            tempProjectItem.parentNode.removeChild(tempProjectItem);
                            isAddingProject = false;
                        }
                    }, 3000);
                }
            } else {
                // Remove the temp item if name is empty
                if (tempProjectItem.parentNode) {
                    tempProjectItem.parentNode.removeChild(tempProjectItem);
                }
            }
            
            isAddingProject = false;
        };
        
        // Save on Enter key or blur
        const handleKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent new line
                projectNameEl.blur(); // Will trigger the blur event
                // Remove the event listener to prevent multiple calls
                projectNameEl.removeEventListener('keydown', handleKeydown);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                // First remove the blur event listener to prevent it from triggering
                projectNameEl.removeEventListener('blur', createNewProject);
                // Cancel project creation
                if (tempProjectItem.parentNode) {
                    tempProjectItem.parentNode.removeChild(tempProjectItem);
                }
                isAddingProject = false;
                // Remove the event listener to prevent multiple calls
                projectNameEl.removeEventListener('keydown', handleKeydown);
            }
        };
        
        projectNameEl.addEventListener('keydown', handleKeydown);
        projectNameEl.addEventListener('blur', createNewProject, { once: true });
    }
}

/**
 * Renders the list of projects and their sessions in the sidebar, minimizing flicker.
 * Uses data from appState.
 */
export async function renderProjectsList() {
    if (!projectsListContainer) return;

    // Store currently expanded project IDs to maintain state across re-renders
    const expandedProjectIds = new Set(
        [...projectsListContainer.querySelectorAll('.project-item.expanded')]
            .map(el => el.dataset.projectId)
    );

    // *** START REFACTOR: Use DocumentFragment ***
    const activeProjectsFragment = document.createDocumentFragment();
    const archivedProjectsFragment = document.createDocumentFragment();
    let hasArchivedProjects = false;

    if (!appState.projects || appState.projects.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-list';
        emptyDiv.textContent = 'No projects found.';
        activeProjectsFragment.appendChild(emptyDiv);
    } else {
        // Sort projects by last update time (most recent first), with fallback to creation time
        // If both are missing, sort by name
        const sortedProjects = [...appState.projects].sort((a, b) => {
            // Use updatedAt if available (most recent first)
            if (a.updatedAt && b.updatedAt) {
                return new Date(b.updatedAt) - new Date(a.updatedAt);
            }
            // Fallback to createdAt if available
            if (a.createdAt && b.createdAt) {
                return new Date(b.createdAt) - new Date(a.createdAt);
            }
            // Final fallback to name (alphabetical)
            return a.name.localeCompare(b.name);
        });

        // Use a Map to hold promises for session rendering if needed, keyed by projectId
        const sessionRenderPromises = new Map();

        for (const project of sortedProjects) {
            // Determine which fragment to use based on archive status
            const isArchived = project.status === 'archived';
            const targetFragment = isArchived ? archivedProjectsFragment : activeProjectsFragment;
            
            if (isArchived) {
                hasArchivedProjects = true;
            }

            const isCurrentProject = project.id === appState.currentProjectId;
            // Always expand the current project, otherwise use the previously expanded state
            const isExpanded = isCurrentProject || expandedProjectIds.has(project.id);

            // --- Create Project Item ---
            const projectItem = document.createElement('div');
            projectItem.className = `project-item ${isExpanded ? 'expanded' : ''} ${isArchived ? 'archived' : ''}`;
            projectItem.dataset.projectId = project.id;

            projectItem.innerHTML = `
                <div class="project-info">
                    <span class="material-icons toggle-icon">${isExpanded ? 'keyboard_arrow_down' : 'keyboard_arrow_right'}</span>
                    <span class="project-name">${project.name}</span>
                </div>
                <button class="project-menu-btn" data-project-id="${project.id}" title="Project options">
                    <span class="material-icons">more_vert</span>
                </button>
            `;

            // --- Create Sessions Container ---
            const sessionsContainer = document.createElement('div');
            sessionsContainer.className = `sessions-container ${isExpanded ? 'expanded' : ''}`;
            sessionsContainer.dataset.projectId = project.id;

            // Append project item and sessions container TO THE FRAGMENT
            targetFragment.appendChild(projectItem);
            targetFragment.appendChild(sessionsContainer);

            // --- Fetch and Render Sessions (only if expanded initially) ---
            if (isExpanded) {
                // Start rendering sessions but don't wait here for each one
                sessionRenderPromises.set(project.id, renderSessionsForProject(project, sessionsContainer));
            }

            // --- Event Listeners for Project Item ---
            const projectInfoDiv = projectItem.querySelector('.project-info');
            const projectMenuBtn = projectItem.querySelector('.project-menu-btn');

            if (projectInfoDiv) {
                projectInfoDiv.addEventListener('click', (e) => {
                    // Don't toggle expansion if clicking on an editable project name
                    if (e.target.classList.contains('project-name') && e.target.getAttribute('contenteditable') === 'true') {
                        return; // Don't toggle when clicking in editable name
                    }
                    
                    const currentlyExpanded = projectItem.classList.contains('expanded');
                    toggleProjectExpansion(project.id); // Toggle classes on the actual DOM elements
                    
                    // If expanding and sessions haven't been loaded yet, load them
                    if (!currentlyExpanded) {
                        // If expanding *now*, fetch and render sessions directly into the *live* DOM container
                        const liveSessionsContainer = projectsListContainer.querySelector(`.sessions-container[data-project-id="${project.id}"]`);
                        if (liveSessionsContainer && (liveSessionsContainer.innerHTML === '' || liveSessionsContainer.querySelector('.loading-sessions'))) {
                            renderSessionsForProject(project, liveSessionsContainer);
                        }
                    }
                });
            }

            if (projectMenuBtn) {
                projectMenuBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showProjectContextMenu(projectMenuBtn, isArchived);
                });
            }
        }
        
        // Wait for all session rendering promises initiated above to complete *if* any were started
        // This ensures sessions are loaded before the fragment is appended, but allows parallel fetching
        await Promise.all([...sessionRenderPromises.values()]);
    }

    // --- Replace content in one go ---
    // Clear the container first
    projectsListContainer.innerHTML = '';
    
    // Add the active projects section
    projectsListContainer.appendChild(activeProjectsFragment);
    
    // Add the archived projects section if we have any
    if (hasArchivedProjects) {
        // Create a section header for archived projects
        const archivedHeader = document.createElement('div');
        archivedHeader.className = 'panel-subheader';
        archivedHeader.innerHTML = '<span>Archived Projects</span>';
        projectsListContainer.appendChild(archivedHeader);
        
        // Add the archived projects
        projectsListContainer.appendChild(archivedProjectsFragment);
    }
    // *** END REFACTOR ***
}

/**
 * Helper to fetch and render sessions for a specific project into the provided container element, minimizing flicker.
 * @param {object} project - The project object.
 * @param {HTMLElement} sessionsContainer - The container element to render sessions into.
 */
async function renderSessionsForProject(project, sessionsContainer) {
    if (!sessionsContainer) {
        console.error(`renderSessionsForProject called without a valid container for project ${project.id}`);
        return;
    }

    // *** START REFACTOR: Use DocumentFragment ***
    // Show loading state IN THE TARGET CONTAINER immediately
    sessionsContainer.innerHTML = '<div class="loading-sessions">Loading...</div>'; 

    const fragment = document.createDocumentFragment();
    let contentRendered = false; // Flag to check if we added sessions or an empty/error message

    try {
        const sessions = await api.fetchProjectSessions(project.id);

        if (!sessions || sessions.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'empty-list';
            emptyDiv.textContent = 'No sessions.';
            fragment.appendChild(emptyDiv);
            contentRendered = true;
        } else {
            // Sort sessions ONLY by creation time (most recent first)
            // The backend already sorts them by creation date (oldest first), so we reverse that
            sessions.sort((a, b) => {
                // Sort ONLY by creation time (most recent first)
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });

            sessions.forEach(session => {
                const isCurrentSession = session.id === appState.currentSessionId;

                const sessionItem = document.createElement('div');
                sessionItem.className = `session-item ${isCurrentSession ? 'active' : ''}`;
                sessionItem.dataset.sessionId = session.id;
                sessionItem.dataset.projectId = project.id;

                sessionItem.innerHTML = `
                     <span class="session-name" title="${session.name}">${session.name}</span>
                     <button class="project-menu-btn session-menu-btn" data-session-id="${session.id}" title="Session options">
                         <span class="material-icons">more_vert</span>
                     </button>
                 `;

                // Add event listeners before appending to fragment
                sessionItem.addEventListener('click', (e) => {
                    // Don't trigger if clicking on an editable session name
                    if (e.target.classList.contains('session-name') && e.target.getAttribute('contenteditable') === 'true') {
                        return;
                    }
                    
                    if (!e.target.closest('.session-menu-btn')) {
                        switchToSession(project.id, session.id);
                    }
                });

                const sessionMenuBtn = sessionItem.querySelector('.session-menu-btn');
                if (sessionMenuBtn) {
                    sessionMenuBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showSessionContextMenu(sessionMenuBtn);
                    });
                }

                fragment.appendChild(sessionItem); // Append session to fragment
            });
            contentRendered = true;
        }

    } catch (error) {
        console.error(`Error fetching sessions for project ${project.id}:`, error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-list';
        errorDiv.textContent = 'Load error.';
        fragment.appendChild(errorDiv);
        contentRendered = true;
    }

    // --- Replace content of the target container in one go ---
    if (contentRendered) {
        // Clear the loading message and add the fragment content
        sessionsContainer.replaceChildren(fragment);
    } else {
        // Fallback if something went wrong and fragment is empty
        sessionsContainer.innerHTML = '<div class="error-list">Render error.</div>';
    }
    // *** END REFACTOR ***
}

/** Helper to toggle project expansion state */
function toggleProjectExpansion(projectId) {
    const projectItem = projectsListContainer.querySelector(`.project-item[data-project-id="${projectId}"]`);
    const sessionsContainer = projectsListContainer.querySelector(`.sessions-container[data-project-id="${projectId}"]`);
    const toggleIcon = projectItem?.querySelector('.toggle-icon');

    if (projectItem && sessionsContainer && toggleIcon) {
        const isExpanding = !projectItem.classList.contains('expanded');
        projectItem.classList.toggle('expanded');
        sessionsContainer.classList.toggle('expanded');
        toggleIcon.textContent = isExpanding ? 'keyboard_arrow_down' : 'keyboard_arrow_right';
    }
}

/** Handles switching to the first available session of a different project. */
export async function switchToProject(projectId) {
    if (projectId === appState.currentProjectId) return;

    console.log(`Switching to project: ${projectId}`);
    enableChatInput(false);

    try {
        const sessions = await api.fetchProjectSessions(projectId);
        if (!sessions || sessions.length === 0) {
            console.log(`Project ${projectId} has no sessions. Creating 'Initial Session'.`);
            const newSession = await api.createSession(projectId, "Initial Session");
            if (newSession && newSession.id) {
                await switchToSession(projectId, newSession.id);
            } else {
                throw new Error('No sessions found and failed to create a default session.');
            }
        } else {
            // Assuming sessions sorted newest first by renderSessionsForProject helper logic
            const targetSessionId = sessions[0].id;
            await switchToSession(projectId, targetSessionId);
        }
    } catch (error) {
        console.error('Error switching project:', error);
        alert('Error switching project: ' + error.message);
        setStatus('error', 'Switch Error');
        enableChatInput(false); // Keep disabled on error? Maybe enable? Depends.
        renderProjectsList(); // Attempt to restore previous UI state
    }
}

/** Handles switching to a specific session. */
export async function switchToSession(projectId, sessionId) {
    if (sessionId === appState.currentSessionId) return;

    console.log(`Switching to session: ${sessionId} in project: ${projectId}`);
    enableChatInput(false);

    try {
        // 1. De-activate the previously active session element (if one exists)
        if (appState.currentSessionId) {
            const previousSessionElement = projectsListContainer.querySelector(`.session-item[data-session-id="${appState.currentSessionId}"]`);
            if (previousSessionElement) {
                previousSessionElement.classList.remove('active');
            }
        }

        // 2. Activate the newly selected session element
        const newSessionElement = projectsListContainer.querySelector(`.session-item[data-session-id="${sessionId}"]`);
        if (newSessionElement) {
            newSessionElement.classList.add('active');
        } else {
            console.warn(`Session element with ID ${sessionId} not found in the DOM during switch. Sidebar highlight might be missing.`);
        }

        // 3. Update current session on server
        await api.setCurrentSessionOnServer(sessionId);

        // 4. Update local state
        appState.currentProjectId = projectId;
        appState.currentSessionId = sessionId;
        appState.currentProject = appState.projects.find(p => p.id === projectId) || null;
        const sessionData = await api.fetchSessionDetails(sessionId);
        if (sessionData) {
            appState.currentSession = sessionData;
            appState.workingDirectory = sessionData.workingDirectory || null;
        } else {
            console.warn(`Failed to fetch details for session ${sessionId}.`);
            appState.currentSession = null;
            appState.workingDirectory = null;
        }

        // 5. Update UI immediately (except for sidebar which was already updated)
        clearMessages();
        clearToolLogs();
        setWorkingDirectoryDisplay(appState.workingDirectory);
        updateChatHeader(); // Update the chat header with new project/session info

        // 6. Notify WebSocket server
        if (appState.socket?.connected) {
            emitJoinSession(appState.socket, projectId, sessionId);
        } else {
            console.warn("Socket not connected during session switch. Connection handler will join.");
        }

    } catch (error) {
        console.error('Error switching session:', error);
        alert('Error switching session: ' + error.message);
        setStatus('error', 'Switch Error');
        renderProjectsList(); // Attempt to restore UI in case of error
        enableChatInput(false);
    }
}

/** Initializes context menu functionality and listeners. */
function initProjectMenus() {
    if (!projectContextMenu || !sessionContextMenu) {
        console.warn("Context menu elements not found.");
        return;
    }

    // Use the module-scoped variable 'activeContextMenu' here
    document.addEventListener('click', (e) => {
        // Close the menu if clicking outside of it
        if (activeContextMenu && !activeContextMenu.contains(e.target)) {
            activeContextMenu.style.display = 'none';
            activeContextMenu = null; // Reset the tracked menu
        }
    });

    // --- Project Context Menu Actions ---
    projectContextMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const action = item.getAttribute('data-action');
            const projectId = projectContextMenu.dataset.projectId; // Get ID from menu dataset
            if (!action || !projectId) return;

            const project = appState.projects.find(p => p.id === projectId);
            if (!project) return;

            // Hide menu *before* action (especially if action involves prompt/alert)
            projectContextMenu.style.display = 'none';
            activeContextMenu = null;

            switch (action) {
                case 'rename':
                    // Find the project name element
                    const projectNameEl = document.querySelector(`.project-item[data-project-id="${projectId}"] .project-name`);
                    if (projectNameEl) {
                        // Make the name editable
                        projectNameEl.contentEditable = true;
                        projectNameEl.focus();
                        // Select all text
                        window.getSelection().selectAllChildren(projectNameEl);
                        
                        // Handle saving when done editing
                        const saveProjectName = async () => {
                            projectNameEl.contentEditable = false;
                            const newProjName = projectNameEl.textContent.trim();
                            
                            // Only make API call if name actually changed
                            if (newProjName && newProjName !== project.name) {
                                try {
                                    await api.updateProjectName(projectId, newProjName);
                                    project.name = newProjName; // Update local state
                                } catch (error) { 
                                    handleActionError('renaming project', error);
                                    projectNameEl.textContent = project.name; // Revert on error
                                }
                            } else {
                                // Revert if empty or unchanged
                                projectNameEl.textContent = project.name;
                            }
                        };
                        
                        // Save on Enter key or blur
                        const handleKeydown = (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault(); // Prevent new line
                                projectNameEl.blur(); // Will trigger the blur event
                                // Remove the event listener to prevent multiple calls
                                projectNameEl.removeEventListener('keydown', handleKeydown);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                projectNameEl.textContent = project.name; // Revert
                                projectNameEl.blur();
                                // Remove the event listener to prevent multiple calls
                                projectNameEl.removeEventListener('keydown', handleKeydown);
                            }
                        };
                        projectNameEl.addEventListener('keydown', handleKeydown);
                        
                        projectNameEl.addEventListener('blur', saveProjectName, { once: true });
                    }
                    break;

                case 'add-session':
                    // Ensure project is expanded before adding
                    const projectItem = projectsListContainer.querySelector(`.project-item[data-project-id="${projectId}"]`);
                    if (projectItem && !projectItem.classList.contains('expanded')) {
                        toggleProjectExpansion(projectId);
                    }
                    
                    // Get the sessions container
                    const sessionsContainer = projectsListContainer.querySelector(`.sessions-container[data-project-id="${projectId}"]`);
                    if (!sessionsContainer) {
                        console.error('Sessions container not found');
                        return;
                    }
                    
                    // Check if we're already adding a session
                    if (isAddingSession) return;
                    isAddingSession = true;
                    
                    // Create a temporary session item
                    const tempSessionItem = document.createElement('div');
                    tempSessionItem.className = 'session-item temp-project'; // Reuse the temp-project style
                    tempSessionItem.dataset.sessionId = 'temp';
                    tempSessionItem.dataset.projectId = projectId;
                    
                    tempSessionItem.innerHTML = `
                        <span class="session-name">New Session</span>
                        <button class="project-menu-btn session-menu-btn" data-session-id="temp" title="Session options">
                            <span class="material-icons">more_vert</span>
                        </button>
                    `;
                    
                    // Insert at the top of the sessions container
                    if (sessionsContainer.firstChild) {
                        sessionsContainer.insertBefore(tempSessionItem, sessionsContainer.firstChild);
                    } else {
                        sessionsContainer.appendChild(tempSessionItem);
                    }
                    
                    // Make the session name editable
                    const sessionNameEl = tempSessionItem.querySelector('.session-name');
                    if (sessionNameEl) {
                        // Make the name editable
                        sessionNameEl.contentEditable = true;
                        sessionNameEl.focus();
                        // Select all text
                        window.getSelection().selectAllChildren(sessionNameEl);
                        
                        // Handle saving when done editing
                        const createNewSession = async () => {
                            sessionNameEl.contentEditable = false;
                            const sessionName = sessionNameEl.textContent.trim();
                            
                            if (sessionName) {
                                try {
                                    // Show a loading state
                                    tempSessionItem.classList.add('creating');
                                    sessionNameEl.textContent = 'Creating...';
                                    
                                    // Create the session
                                    const newSession = await api.createSession(projectId, sessionName);
                                    
                                    // Remove the temporary item
                                    if (tempSessionItem.parentNode) {
                                        tempSessionItem.parentNode.removeChild(tempSessionItem);
                                    }
                                    
                                    // Re-render the project's sessions
                                    await renderSessionsForProject(project, sessionsContainer);
                                    
                                    // Switch to the new session
                                    await switchToSession(projectId, newSession.id);
                                } catch (error) {
                                    console.error('Error creating session:', error);
                                    tempSessionItem.classList.remove('creating');
                                    sessionNameEl.textContent = 'Error: ' + (error.message || 'Failed to create session');
                                    
                                    // Remove the error message after a delay
                                    setTimeout(() => {
                                        if (tempSessionItem.parentNode) {
                                            tempSessionItem.parentNode.removeChild(tempSessionItem);
                                            isAddingSession = false;
                                        }
                                    }, 3000);
                                }
                            } else {
                                // Remove the temp item if name is empty
                                if (tempSessionItem.parentNode) {
                                    tempSessionItem.parentNode.removeChild(tempSessionItem);
                                }
                            }
                            
                            isAddingSession = false;
                        };
                        
                        // Save on Enter key or blur
                        const handleKeydown = (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault(); // Prevent new line
                                sessionNameEl.blur(); // Will trigger the blur event
                                // Remove the event listener to prevent multiple calls
                                sessionNameEl.removeEventListener('keydown', handleKeydown);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                // First remove the blur event listener to prevent it from triggering
                                sessionNameEl.removeEventListener('blur', createNewSession);
                                // Cancel session creation
                                if (tempSessionItem.parentNode) {
                                    tempSessionItem.parentNode.removeChild(tempSessionItem);
                                }
                                isAddingSession = false;
                                // Remove the event listener to prevent multiple calls
                                sessionNameEl.removeEventListener('keydown', handleKeydown);
                            }
                        };
                        
                        sessionNameEl.addEventListener('keydown', handleKeydown);
                        sessionNameEl.addEventListener('blur', createNewSession, { once: true });
                    }
                    break;

                case 'archive':
                    const confirmedArchive = await showConfirmationModal({
                        title: 'Archive Project',
                        message: `Are you sure you want to archive the project "${project.name}"?`,
                        confirmText: 'Archive Project',
                        confirmVariant: 'warning',
                    });
                    
                    if (confirmedArchive) {
                        try {
                            setStatus('thinking', `Archiving project ${project.name}...`);
                            await api.updateProjectStatus(projectId, 'archived');
                            project.status = 'archived';
                            renderProjectsList(); // Re-render to move to archived section
                            if (projectId === appState.currentProjectId) {
                                const nextProject = appState.projects.find(p => p.id !== projectId && p.status !== 'archived');
                                if (nextProject) await switchToProject(nextProject.id);
                                else handleLastProjectAction("archived");
                            }
                            setStatus('idle');
                        } catch (error) { 
                            handleActionError('archiving project', error); 
                            setStatus('error', 'Archive failed');
                        }
                    } else {
                        console.log("Project archive cancelled by user.");
                    }
                    break;
                    
                case 'unarchive':
                    const confirmedUnarchive = await showConfirmationModal({
                        title: 'Unarchive Project',
                        message: `Are you sure you want to unarchive the project "${project.name}"?`,
                        confirmText: 'Unarchive Project',
                        confirmVariant: 'primary',
                    });
                    
                    if (confirmedUnarchive) {
                        try {
                            setStatus('thinking', `Unarchiving project ${project.name}...`);
                            await api.updateProjectStatus(projectId, 'active');
                            project.status = 'active';
                            renderProjectsList(); // Re-render to move to active projects section
                            setStatus('idle');
                        } catch (error) { 
                            handleActionError('unarchiving project', error); 
                            setStatus('error', 'Unarchive failed');
                        }
                    } else {
                        console.log("Project unarchive cancelled by user.");
                    }
                    break;

                case 'delete':
                    const confirmedProjectDelete = await showConfirmationModal({
                        title: 'Delete Project',
                        message: `Are you sure you want to permanently delete the project "${project.name}" and all its sessions?`,
                        itemName: 'This action cannot be undone.',
                        confirmText: 'Delete Project',
                        confirmVariant: 'danger',
                    });
                    
                    if (confirmedProjectDelete) {
                        try {
                            setStatus('thinking', `Deleting project ${project.name}...`);
                            await api.deleteProject(projectId);
                            appState.projects = appState.projects.filter(p => p.id !== projectId);
                            renderProjectsList();
                            if (projectId === appState.currentProjectId) {
                                const nextProject = appState.projects.find(p => p.status !== 'archived');
                                if (nextProject) await switchToProject(nextProject.id);
                                else handleLastProjectAction("deleted");
                            }
                            setStatus('idle');
                        } catch (error) { 
                            handleActionError('deleting project', error); 
                            setStatus('error', 'Delete failed');
                        }
                    } else {
                        console.log("Project deletion cancelled by user.");
                    }
                    break;
            }
        });
    });

    // --- Session Context Menu Actions ---
    sessionContextMenu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            const action = item.getAttribute('data-action');
            const sessionId = sessionContextMenu.dataset.sessionId;
            const sessionElement = projectsListContainer.querySelector(`.session-item[data-session-id="${sessionId}"]`);
            const projectId = sessionElement?.dataset.projectId;

            if (!action || !sessionId || !projectId) return;

            const project = appState.projects.find(p => p.id === projectId);
            const sessionName = sessionElement?.querySelector('.session-name')?.textContent || 'this session';

            // Hide menu *before* action
            sessionContextMenu.style.display = 'none';
            activeContextMenu = null;

            switch (action) {
                case 'rename-session':
                    // Find the session name element
                    const sessionNameEl = document.querySelector(`.session-item[data-session-id="${sessionId}"] .session-name`);
                    if (sessionNameEl) {
                        // Make the name editable
                        sessionNameEl.contentEditable = true;
                        sessionNameEl.focus();
                        // Select all text
                        window.getSelection().selectAllChildren(sessionNameEl);
                        
                        // Handle saving when done editing
                        const saveSessionName = async () => {
                            sessionNameEl.contentEditable = false;
                            const newSessName = sessionNameEl.textContent.trim();
                            
                            // Only make API call if name actually changed
                            if (newSessName && newSessName !== sessionName) {
                                try {
                                    await api.updateSessionName(sessionId, newSessName);
                                    // No need to re-render the entire session list, just update the displayed name
                                    sessionNameEl.textContent = newSessName;
                                    sessionNameEl.title = newSessName;
                                } catch (error) { 
                                    handleActionError('renaming session', error);
                                    sessionNameEl.textContent = sessionName; // Revert on error
                                    sessionNameEl.title = sessionName;
                                }
                            } else {
                                // Revert if empty or unchanged
                                sessionNameEl.textContent = sessionName;
                                sessionNameEl.title = sessionName;
                            }
                        };
                        
                        // Save on Enter key or blur
                        const handleKeydown = (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault(); // Prevent new line
                                sessionNameEl.blur(); // Will trigger the blur event
                                // Remove the event listener to prevent multiple calls
                                sessionNameEl.removeEventListener('keydown', handleKeydown);
                            } else if (e.key === 'Escape') {
                                e.preventDefault();
                                sessionNameEl.textContent = sessionName; // Revert
                                sessionNameEl.title = sessionName;
                                sessionNameEl.blur();
                                // Remove the event listener to prevent multiple calls
                                sessionNameEl.removeEventListener('keydown', handleKeydown);
                            }
                        };
                        sessionNameEl.addEventListener('keydown', handleKeydown);
                        
                        sessionNameEl.addEventListener('blur', saveSessionName, { once: true });
                    }
                    break;

                case 'clear-session':
                    const confirmedClear = await showConfirmationModal({
                        title: 'Clear Session Messages',
                        message: `Are you sure you want to clear all messages from session "${sessionName}"?`,
                        itemName: 'This action cannot be undone.',
                        confirmText: 'Clear Messages',
                        confirmVariant: 'warning',
                    });
                    
                    if (confirmedClear) {
                        try {
                            setStatus('thinking', `Clearing session ${sessionName}...`);
                            await api.clearSessionMessages(sessionId);
                            if (sessionId === appState.currentSessionId) {
                                console.log(`Reloading current session ${sessionId} after clear.`);
                                setStatus('connecting', 'Reloading session...');
                                enableChatInput(false);
                                clearMessages();
                                clearToolLogs();
                                if (appState.socket?.connected) {
                                    emitJoinSession(appState.socket, projectId, sessionId);
                                } else {
                                    console.warn("Cannot reload cleared session: Socket not connected.");
                                    alert("Session cleared, but couldn't automatically reload. Please switch sessions or refresh.");
                                }
                            } else {
                                // Provide feedback even if not current session
                                alert(`Session "${sessionName}" has been cleared.`);
                            }
                            setStatus('idle');
                        } catch (error) { 
                            handleActionError('clearing session', error); 
                            setStatus('error', 'Clear failed');
                        }
                    } else {
                        console.log("Session clear cancelled by user.");
                    }
                    break;

                case 'delete-session':
                    const confirmedSessionDelete = await showConfirmationModal({
                        title: 'Delete Session',
                        message: `Are you sure you want to permanently delete the session "${sessionName}"?`,
                        itemName: 'This action cannot be undone.',
                        confirmText: 'Delete Session',
                        confirmVariant: 'danger',
                    });
                    
                    if (confirmedSessionDelete) {
                        try {
                            setStatus('thinking', `Deleting session ${sessionName}...`);
                            await api.deleteSession(sessionId);
                            const sessionsContainer = projectsListContainer.querySelector(`.sessions-container[data-project-id="${projectId}"]`);
                            if(project && sessionsContainer) await renderSessionsForProject(project, sessionsContainer);

                            if (sessionId === appState.currentSessionId) {
                                const remainingSessions = await api.fetchProjectSessions(projectId);
                                // Sort by creation time (most recent first)
                                // Use the SAME sorting as in the main sessions list
                                remainingSessions.sort((a, b) => {
                                    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
                                });
                                const nextSession = remainingSessions.find(s => s.id !== sessionId); // Find any other session
                                if (nextSession) {
                                    await switchToSession(projectId, nextSession.id);
                                } else {
                                    // No sessions left in this project, switch project
                                    const nextProject = appState.projects.find(p => p.id !== projectId && p.status !== 'archived');
                                    if (nextProject) await switchToProject(nextProject.id);
                                    else handleLastProjectAction("deleted the last session of");
                                }
                            }
                            setStatus('idle');
                        } catch (error) { 
                            handleActionError('deleting session', error); 
                            setStatus('error', 'Delete failed');
                        }
                    } else {
                        console.log("Session deletion cancelled by user.");
                    }
                    break;
            }
        });
    });
    console.log("Project/Session context menus initialized.");
}


/** Displays the project-specific context menu. */
export function showProjectContextMenu(button, isArchived = false) {
    if (!projectContextMenu) return;
    if (sessionContextMenu) sessionContextMenu.style.display = 'none'; // Close other menu

    const rect = button.getBoundingClientRect();
    projectContextMenu.style.top = `${rect.bottom + window.scrollY}px`; // Adjust for scroll
    projectContextMenu.style.left = `${rect.left + window.scrollX}px`;
    projectContextMenu.style.display = 'block';
    projectContextMenu.dataset.projectId = button.dataset.projectId;
    
    // Find the archive/unarchive menu item - search by both possible data-actions
    // to ensure we always find it regardless of its current state
    let archiveItem = projectContextMenu.querySelector('[data-action="archive"]');
    if (!archiveItem) {
        archiveItem = projectContextMenu.querySelector('[data-action="unarchive"]');
    }
    
    if (archiveItem) {
        // Update the menu item based on the project's archived status
        if (isArchived) {
            archiveItem.innerHTML = '<span class="material-icons">unarchive</span>Unarchive';
            archiveItem.setAttribute('data-action', 'unarchive');
        } else {
            archiveItem.innerHTML = '<span class="material-icons">archive</span>Archive';
            archiveItem.setAttribute('data-action', 'archive');
        }
    }

    activeContextMenu = projectContextMenu; // Use module-scope variable
}

/** Displays the session-specific context menu. */
export function showSessionContextMenu(button) {
    if (!sessionContextMenu) return;
    if (projectContextMenu) projectContextMenu.style.display = 'none'; // Close other menu

    const rect = button.getBoundingClientRect();
    sessionContextMenu.style.top = `${rect.bottom + window.scrollY}px`; // Adjust for scroll
    sessionContextMenu.style.left = `${rect.left + window.scrollX}px`;
    sessionContextMenu.style.display = 'block';
    sessionContextMenu.dataset.sessionId = button.dataset.sessionId;

    activeContextMenu = sessionContextMenu; // Use module-scope variable
}

/** Generic error handler for context menu actions */
function handleActionError(actionDescription, error) {
    console.error(`Error ${actionDescription}:`, error);
    alert(`Error ${actionDescription}: ${error.message}`);
}

/** Handles cleanup when the last project/session is affected */
function handleLastProjectAction(actionVerb) {
    alert(`You ${actionVerb} the last available project/session. Reloading to ensure a default exists.`);
    // Consider a less disruptive action? For now, reload is simplest.
    window.location.reload();
}