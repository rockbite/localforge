/**
 * Bridge script for making module-scoped functions available globally
 * This is needed for backward compatibility with event handlers that reference
 * global functions while the app is being refactored to use ES modules.
 */

// Create a global bridge for modules to expose their functions
window.bridge = {};

// DOM ready handler that creates listeners for all module-exposed functions
document.addEventListener('DOMContentLoaded', () => {
    // Set up various event listeners for elements that need them
    
    // Settings button
    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            if (window.settingsUI) {
                window.settingsUI.openDialog();
            }
        });
    }
    
    // Context menu helpers (from projects.js)
    window.bridge.showProjectContextMenu = null; // Will be set by projects.js module
    window.bridge.showSessionContextMenu = null; // Will be set by projects.js module
    window.bridge.switchToProject = null;        // Will be set by projects.js module
    window.bridge.switchToSession = null;        // Will be set by projects.js module
    
    console.log("JS Bridge initialized. Module functions can now be exposed globally.");
});

// Make these globally available for any inline handlers
window.showProjectContextMenu = function(button, isArchived) {
    if (window.bridge.showProjectContextMenu) {
        window.bridge.showProjectContextMenu(button, isArchived);
    }
};

window.showSessionContextMenu = function(button) {
    if (window.bridge.showSessionContextMenu) {
        window.bridge.showSessionContextMenu(button);
    }
};

window.switchToProject = function(projectId) {
    if (window.bridge.switchToProject) {
        window.bridge.switchToProject(projectId);
    }
};

window.switchToSession = function(projectId, sessionId) {
    if (window.bridge.switchToSession) {
        window.bridge.switchToSession(projectId, sessionId);
    }
};

window.toggleProjectExpansion = function(projectId) {
    if (window.bridge.toggleProjectExpansion) {
        window.bridge.toggleProjectExpansion(projectId);
    }
};

window.openSettings = function() {
    if (window.settingsUI) {
        window.settingsUI.openDialog();
    }
};