// src/utils.js
// Purpose: Contains shared utility functions used across different modules.

/**
 * Shows a notification message to the user.
 * @param {string} message - The message to display.
 * @param {string} [icon='info'] - The material icon to show.
 * @param {string} [type='info'] - The type of notification (success, error, warning, info).
 * @param {number} [duration=3000] - How long to show the notification in ms.
 */
export function showNotification(message, icon = 'info', type = 'info', duration = 3000) {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('app-notification');
    
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'app-notification';
        notification.classList.add('app-notification');
        document.body.appendChild(notification);
        
        // Add the CSS if it doesn't exist
        if (!document.getElementById('notification-style')) {
            const style = document.createElement('style');
            style.id = 'notification-style';
            style.textContent = `
                .app-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    padding: 10px 16px;
                    border-radius: 6px;
                    background-color: var(--bg-secondary);
                    color: var(--text-primary);
                    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 14px;
                    z-index: 1000;
                    opacity: 0;
                    transform: translateY(20px);
                    transition: opacity 0.3s, transform 0.3s;
                    border-left: 4px solid var(--border-primary);
                    max-width: 300px;
                }
                .app-notification.visible {
                    opacity: 1;
                    transform: translateY(0);
                }
                .app-notification.success {
                    border-left-color: #4caf50;
                }
                .app-notification.error {
                    border-left-color: #f44336;
                }
                .app-notification.warning {
                    border-left-color: #ff9800;
                }
                .app-notification.info {
                    border-left-color: #2196f3;
                }
                .app-notification .icon {
                    color: var(--text-secondary);
                }
                .app-notification.success .icon {
                    color: #4caf50;
                }
                .app-notification.error .icon {
                    color: #f44336;
                }
                .app-notification.warning .icon {
                    color: #ff9800;
                }
                .app-notification.info .icon {
                    color: #2196f3;
                }
            `;
            document.head.appendChild(style);
        }
    }
    
    // Clear any existing content and classes except the base class
    notification.className = 'app-notification';
    notification.classList.add(type);
    
    // Set content
    notification.innerHTML = `
        <span class="icon material-icons">${icon}</span>
        <span class="message">${message}</span>
    `;
    
    // Make visible
    setTimeout(() => {
        notification.classList.add('visible');
    }, 10);
    
    // Hide after duration
    setTimeout(() => {
        notification.classList.remove('visible');
    }, duration);
}

/**
 * Formats elapsed time in milliseconds into a human-readable string (e.g., "1.2s", "15s").
 * @param {HTMLElement | null} element - The DOM element to update (optional).
 * @param {number} elapsedMs - The elapsed time in milliseconds.
 * @returns {string} The formatted time string.
 */
export function updateTimerDisplay(element, elapsedMs) {
    const elapsedSec = elapsedMs / 1000;
    let displayTime;

    if (elapsedSec < 0) {
        displayTime = '0.0s'; // Avoid negative display
    } else if (elapsedSec < 10) {
        displayTime = elapsedSec.toFixed(1) + 's';
    } else {
        displayTime = Math.floor(elapsedSec) + 's';
    }

    if (element) {
        element.textContent = displayTime;
    }
    return displayTime;
}

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
export function showConfirmationModal({
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

// Note: Initialization logic for external libraries like 'marked' or 'Prism'
// is omitted here. It's assumed they are loaded and configured globally
// via <script> tags or another module bundler setup.
// If specific configuration were needed, it could potentially go here.
// export function configureMarkdown() {
//     // Example: marked.setOptions(...)
// }

/**
 * This function is deprecated - tooltips are now initialized directly in main.js
 */
export function initTooltips() {
    console.warn('initTooltips in utils.js is deprecated; tooltips are now initialized directly in main.js');
}

/**
 * Checks if the application is running in Electron environment
 * @returns {boolean} - True if running in Electron, false otherwise
 */
export function isElectronEnvironment() {
    return window.electronAPI && typeof window.electronAPI.isElectron === 'function' && window.electronAPI.isElectron();
}

/**
 * Initialize global ESC key handler to close active modals
 * Call this once during app initialization
 */
export function initGlobalModalEscHandler() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Check for any active modals in order of priority
            const activeModals = document.querySelectorAll('.modal.active, [id$="-modal"].active');
            
            if (activeModals.length > 0) {
                // Get the last active modal (assuming it's the one on top)
                const lastModal = activeModals[activeModals.length - 1];
                
                // Find close button within the modal
                const closeButton = lastModal.querySelector('[id$="-close"], .modal-close, .close-button');
                
                if (closeButton) {
                    // Simulate a click on the close button
                    closeButton.click();
                } else {
                    // If no close button found, simply remove the active class
                    lastModal.classList.remove('active');
                }
                
                // Prevent other ESC handlers from firing
                e.stopPropagation();
            }
        }
    });
}

/**
 * Load the list of agents and populate the agent selector dropdown
 * @param {boolean} [preserveSelection=true] - Whether to preserve the current selection
 * @returns {Promise<Array>} - The list of agents
 */
/**
 * Load the list of MCP servers and populate the MCP selector dropdown
 * @param {boolean} [preserveSelection=true] - Whether to preserve the current selection
 * @returns {Promise<Array>} - The list of MCP servers
 */
export function loadMcpServersList(preserveSelection = true) {
    const mcpSelector = document.getElementById('mcp-selector');
    if (!mcpSelector) return Promise.resolve([]);

    // Store current selection if preserving
    const currentSelection = preserveSelection ? mcpSelector.value : null;

    return fetch('/api/settings')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load settings: ${response.statusText}`);
            }
            return response.json();
        })
        .then(settings => {
            // Parse MCP servers data
            let mcpServers = [];
            if (settings.mcpServers && typeof settings.mcpServers === 'string') {
                try {
                    mcpServers = JSON.parse(settings.mcpServers);
                    if (!Array.isArray(mcpServers)) {
                        mcpServers = [];
                    }
                } catch (error) {
                    console.error('Error parsing MCP servers data:', error);
                }
            }

            // Clear existing options except the first one
            while (mcpSelector.options.length > 1) {
                mcpSelector.remove(1);
            }

            // Add MCP server options
            mcpServers.forEach(server => {
                const option = document.createElement('option');
                option.value = server.alias;
                option.textContent = server.alias;
                option.dataset.url = server.url;
                mcpSelector.appendChild(option);
            });

            // If not already set up, add change event listener for saving MCP selection
            if (!mcpSelector.dataset.hasChangeListener) {
                mcpSelector.addEventListener('change', handleMcpSelection);
                mcpSelector.dataset.hasChangeListener = 'true';
            }

            // Restore previous selection if applicable
            if (preserveSelection && currentSelection) {
                // Check if the previously selected MCP still exists
                const mcpExists = Array.from(mcpSelector.options).some(option => option.value === currentSelection);
                if (mcpExists) {
                    mcpSelector.value = currentSelection;
                } else {
                    // If MCP was deleted, reset to default
                    mcpSelector.value = '';
                    // Update backend with empty MCP alias
                    import('./state.js').then(({ appState }) => {
                        if (appState?.currentSessionId) {
                            import('./api.js').then(api => {
                                api.saveMcpAlias(appState.currentSessionId, '');
                            });
                        }
                    });
                }
            } else {
                // Load current MCP from session if not preserving selection
                loadCurrentMcpSelection();
            }

            return mcpServers;
        })
        .catch(error => {
            console.error('Error loading MCP servers:', error);
            return [];
        });
}

export function loadAgentsList(preserveSelection = true) {
    const agentSelector = document.getElementById('agent-selector');
    if (!agentSelector) return Promise.resolve([]);

    // Store current selection if preserving
    const currentSelection = preserveSelection ? agentSelector.value : null;

    return fetch('/api/agents')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load agents: ${response.statusText}`);
            }
            return response.json();
        })
        .then(agents => {
            if (!Array.isArray(agents)) {
                console.error('Expected agents to be an array but got:', typeof agents);
                return [];
            }
            
            // Clear existing options except the first one
            while (agentSelector.options.length > 1) {
                agentSelector.remove(1);
            }
            
            // Add agent options
            agents.forEach(agent => {
                const option = document.createElement('option');
                option.value = agent.id;
                option.textContent = agent.name;
                agentSelector.appendChild(option);
            });
            
            // If not already set up, add change event listener for saving agent selection
            if (!agentSelector.dataset.hasChangeListener) {
                agentSelector.addEventListener('change', handleAgentSelection);
                agentSelector.dataset.hasChangeListener = 'true';
            }
            
            // Set up listener for agent-updated events if not already set
            if (!agentSelector.dataset.hasUpdateListener) {
                window.addEventListener('agents-updated', () => {
                    // Reload the agent list but preserve selection when agents change
                    loadAgentsList(true);
                });
                agentSelector.dataset.hasUpdateListener = 'true';
            }
            
            // Restore previous selection if applicable
            if (preserveSelection && currentSelection) {
                // Check if the previously selected agent still exists
                const agentExists = Array.from(agentSelector.options).some(option => option.value === currentSelection);
                if (agentExists) {
                    agentSelector.value = currentSelection;
                } else {
                    // If agent was deleted, reset to default
                    agentSelector.value = '';
                    // Update backend with empty agent ID
                    import('./state.js').then(({ appState }) => {
                        if (appState?.currentSessionId) {
                            import('./api.js').then(api => {
                                api.saveAgentId(appState.currentSessionId, '');
                            });
                        }
                    });
                }
            } else {
                // Load current agent from session if not preserving selection
                loadCurrentAgentSelection();
            }
            
            return agents;
        })
        .catch(error => {
            console.error('Error loading agents:', error);
            return [];
        });
}

/**
 * Handle agent selection change event
 * @param {Event} event - The change event
 */
function handleAgentSelection(event) {
    const agentId = event.target.value;
    
    // Import modules dynamically to avoid circular dependencies
    Promise.all([
        import('./api.js'),
        import('./socket.js'),
        import('./state.js')
    ]).then(([api, socket, state]) => {
        const { appState } = state;

        if (!appState || !appState.currentSessionId) {
            console.warn("Cannot save agent selection: no active session.");
            return;
        }
        
        // First save the agent ID to the session data
        api.saveAgentId(appState.currentSessionId, agentId)
            .then(() => {
                console.log(`Agent ${agentId || 'none'} selected for session ${appState.currentSessionId}`);
                
                // Then emit the agent selection via socket
                if (appState.socket) {
                    socket.emitSetAgent(appState.socket, agentId);
                } else {
                    console.warn("Socket not available to emit set_agent.");
                }
            })
            .catch(error => {
                console.error('Error saving agent selection:', error);
            });
    });
}

/**
 * Handle MCP server selection change event
 * @param {Event} event - The change event
 */
function handleMcpSelection(event) {
    const mcpAlias = event.target.value;
    let mcpUrl = '';

    // Get the URL from the selected option
    if (mcpAlias) {
        const selectedOption = event.target.options[event.target.selectedIndex];
        mcpUrl = selectedOption.dataset.url || '';
    }

    // Import modules dynamically to avoid circular dependencies
    Promise.all([
        import('./api.js'),
        import('./socket.js'),
        import('./state.js')
    ]).then(([api, socket, state]) => {
        const { appState } = state;

        if (!appState || !appState.currentSessionId) {
            console.warn("Cannot save MCP selection: no active session.");
            return;
        }

        // First save the MCP alias and URL to the session data
        api.saveMcpData(appState.currentSessionId, mcpAlias, mcpUrl)
            .then(() => {
                console.log(`MCP ${mcpAlias || 'none'} selected for session ${appState.currentSessionId}`);

                // Then emit the MCP selection via socket
                if (appState.socket) {
                    socket.emitSetMcp(appState.socket, mcpAlias, mcpUrl);
                } else {
                    console.warn("Socket not available to emit set_mcp.");
                }
            })
            .catch(error => {
                console.error('Error saving MCP selection:', error);
            });
    });
}

/**
 * Load the current MCP selection from the session data
 */
function loadCurrentMcpSelection() {
    const mcpSelector = document.getElementById('mcp-selector');
    if (!mcpSelector) return;

    // Import state to get the current session
    import('./state.js').then(({ appState }) => {
        if (!appState || !appState.currentSessionId) {
            console.log("No active session to load MCP selection for.");
            return;
        }

        // Import API to get session data
        import('./api.js').then(api => {
            api.getSessionData(appState.currentSessionId)
                .then(sessionData => {
                    if (sessionData && sessionData.mcpAlias) {
                        // Find this MCP in the selector
                        const options = Array.from(mcpSelector.options);
                        const mcpOption = options.find(option => option.value === sessionData.mcpAlias);

                        if (mcpOption) {
                            mcpSelector.value = sessionData.mcpAlias;
                        } else {
                            console.warn(`Selected MCP ${sessionData.mcpAlias} not found in list.`);
                            mcpSelector.value = '';
                        }
                    } else {
                        mcpSelector.value = '';
                    }
                })
                .catch(error => {
                    console.error('Error loading session data for MCP selection:', error);
                });
        });
    });
}

/**
 * Load the current agent selection from the session data
 */
function loadCurrentAgentSelection() {
    const agentSelector = document.getElementById('agent-selector');
    if (!agentSelector) return;
    
    // Import state module dynamically to avoid circular dependencies
    import('./state.js').then(({ appState }) => {
        if (!appState || !appState.currentSessionId) {
            console.warn("Cannot load agent selection: no active session.");
            return;
        }
        
        // Check if current session has agentId property
        if (appState.currentSession && appState.currentSession.data && appState.currentSession.data.agentId) {
            const agentId = appState.currentSession.data.agentId;
            agentSelector.value = agentId;
            console.log(`Loaded agent ${agentId} for session ${appState.currentSessionId}`);
        } else if (appState.agentId) {
            // Fallback to appState.agentId if available
            agentSelector.value = appState.agentId;
            console.log(`Loaded agent ${appState.agentId} from appState`);
        } else {
            // Default to empty selection if no agent is set
            agentSelector.value = '';
        }
    });
}
