// src/ui/settings.js
// Purpose: Handles the settings modal display and interactions.

import * as api from '../api.js';
import { addAgentMessage } from './chat.js'; // For user feedback

// DOM Elements specific to settings
const settingsButton = document.getElementById('settings-button');
const settingsModal = document.getElementById('settings-modal');
const settingsSaveButton = document.getElementById('settings-save');
const settingsCancelButton = document.getElementById('settings-cancel');
const settingsTabs = document.querySelectorAll('.settings-tab');
const settingsTabContents = document.querySelectorAll('.settings-tab-content');

// Provider edit modal elements
const providerEditModal = document.getElementById('provider-edit-modal');
const providerEditTitle = document.getElementById('provider-edit-title');
const providerNameInput = document.getElementById('providerName');
const providerTypeSelect = document.getElementById('providerType');
const providerApiKeyInput = document.getElementById('providerApiKey');
const providerApiUrlInput = document.getElementById('providerApiUrl');
const providerEditCancelButton = document.getElementById('provider-edit-cancel');
const providerEditSaveButton = document.getElementById('provider-edit-save');
const addProviderButton = document.querySelector('.add-provider-btn');
const editProviderButtons = document.querySelectorAll('.edit-provider');

// Input field elements
const openaiApiKeyInput = document.getElementById('openaiApiKey');
const mainModelProviderSelect = document.getElementById('mainModelProvider');
const mainModelNameInput = document.getElementById('mainModelName');
const expertModelProviderSelect = document.getElementById('expertModelProvider');
const expertModelNameInput = document.getElementById('expertModelName');
const usePuppeteerCheckbox = document.getElementById('usePuppeteer');
const googleCseIdInput = document.getElementById('googleCseId');
const googleApiKeyInput = document.getElementById('googleApiKey');
const enableCommandExecutionCheckbox = document.getElementById('enableCommandExecution');
const restrictFilesystemCheckbox = document.getElementById('restrictFilesystem');
const enableWebAccessCheckbox = document.getElementById('enableWebAccess');

/**
 * Initializes the settings dialog functionality (button, tabs, save/cancel).
 */
export function initSettingsDialog() {
    if (!settingsButton || !settingsModal || !settingsSaveButton || !settingsCancelButton) {
        console.warn("Settings modal elements not found, skipping initialization.");
        return;
    }

    // --- Tab Switching Logic ---
    settingsTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTabId = this.getAttribute('data-tab');
            settingsTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            settingsTabContents.forEach(content => {
                const contentTabId = content.id.replace('-tab', '');
                if (contentTabId === targetTabId) {
                    content.style.visibility = 'visible';
                    content.style.position = 'relative';
                    content.style.zIndex = '1';
                } else {
                    content.style.visibility = 'hidden';
                    content.style.position = 'absolute';
                    content.style.zIndex = '-1';
                }
            });
        });
    });
    // Ensure the first tab is active initially
    if (settingsTabs.length > 0 && !document.querySelector('.settings-tab.active')) {
        settingsTabs[0].click();
    }

    // --- Button Listeners ---
    // Attach showSettingsModal which handles loading data internally
    settingsButton.addEventListener('click', showSettingsModal);

    settingsSaveButton.addEventListener('click', saveSettings); // Keep separate save logic

    settingsCancelButton.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    // Provider edit modal functionality
    initProviderEditModal();

    console.log("Settings dialog initialized.");
}

/**
 * Initializes the provider edit modal functionality
 */
function initProviderEditModal() {
    // Initialize password toggle functionality
    const togglePasswordButton = document.querySelector('.toggle-password');
    if (togglePasswordButton) {
        togglePasswordButton.addEventListener('click', function() {
            const passwordInput = this.parentElement.querySelector('input');
            const iconElement = this.querySelector('.material-icons');
            
            if (passwordInput.type === 'password') {
                passwordInput.type = 'text';
                iconElement.textContent = 'visibility';
            } else {
                passwordInput.type = 'password';
                iconElement.textContent = 'visibility_off';
            }
        });
    }

    // Add provider button functionality
    if (addProviderButton) {
        addProviderButton.addEventListener('click', function() {
            showProviderEditModal();
        });
    }

    // Edit provider buttons functionality
    if (editProviderButtons) {
        editProviderButtons.forEach(button => {
            button.addEventListener('click', function() {
                const providerItem = this.closest('.provider-item');
                const providerName = providerItem.querySelector('.provider-name').textContent;
                const providerType = providerItem.querySelector('.provider-type-label').textContent;
                
                // Mock data for demonstration purposes only
                const mockProviderData = {
                    name: providerName,
                    type: providerType,
                    apiKey: '********',
                    apiUrl: 'https://api.example.com/v1'
                };
                
                showProviderEditModal(mockProviderData);
            });
        });
    }

    // Provider edit modal buttons
    if (providerEditCancelButton) {
        providerEditCancelButton.addEventListener('click', function() {
            closeProviderEditModal();
        });
    }

    if (providerEditSaveButton) {
        providerEditSaveButton.addEventListener('click', function() {
            // In a real implementation, this would save the provider data
            // For demo purposes, we'll just close the modal
            closeProviderEditModal();
        });
    }
}

/**
 * Loads settings data and displays the settings modal.
 * This is the function typically called to open the settings.
 */
export async function showSettingsModal() {
    if (!settingsModal) {
        console.error("Settings modal element not found.");
        return;
    }
    
    // Set initial styles to prevent flash
    const modalContent = settingsModal.querySelector('.modal-content');
    if (modalContent) {
        modalContent.style.opacity = '0';
    }
    
    // Show modal (without animation initially)
    settingsModal.style.display = 'flex';
    
    // Load data first before showing animation
    setLoadingState(true);

    try {
        const settingsData = await api.loadSettingsFromServer();
        populateSettingsForm(settingsData);
        
        // Now add the active class for animation
        setTimeout(() => {
            // Reset opacity first
            if (modalContent) {
                modalContent.style.opacity = '';
            }
            settingsModal.style.display = '';
            settingsModal.classList.add('active');
        }, 10);
    } catch (error) {
        console.error("Failed to load settings:", error);
        alert(`Error loading settings: ${error.message}`);
        populateSettingsForm({}); // Clear form on error
        
        // Still show modal even on error
        setTimeout(() => {
            if (modalContent) {
                modalContent.style.opacity = '';
            }
            settingsModal.style.display = '';
            settingsModal.classList.add('active');
        }, 10);
    } finally {
        setLoadingState(false);
    }
}


// Internal helper, not exported directly now if showSettingsModal is the main entry point
/** Fetches settings from the server and populates the form */
// async function loadAndShowSettings() { ... } // Logic moved into showSettingsModal

/**
 * Populates the settings form fields with data loaded from the server.
 * @param {object} data - The settings data object.
 */
export function populateSettingsForm(data = {}) { // Export needed if called from socket error handler
    if (openaiApiKeyInput) openaiApiKeyInput.value = data.openaiApiKey || '';
    if (mainModelProviderSelect) mainModelProviderSelect.value = data.mainModelProvider || 'openai';
    if (mainModelNameInput) mainModelNameInput.value = data.mainModelName || '';
    if (expertModelProviderSelect) expertModelProviderSelect.value = data.expertModelProvider || 'openai';
    if (expertModelNameInput) expertModelNameInput.value = data.expertModelName || '';
    if (usePuppeteerCheckbox) usePuppeteerCheckbox.checked = data.usePuppeteer === true;
    if (googleCseIdInput) googleCseIdInput.value = data.googleCseId || '';
    if (googleApiKeyInput) googleApiKeyInput.value = data.googleApiKey || '';
    if (enableCommandExecutionCheckbox) enableCommandExecutionCheckbox.checked = data.enableCommandExecution !== false;
    if (restrictFilesystemCheckbox) restrictFilesystemCheckbox.checked = data.restrictFilesystem === true;
    if (enableWebAccessCheckbox) enableWebAccessCheckbox.checked = data.enableWebAccess !== false;
    // console.log("Settings form populated."); // Less noisy log
}

/**
 * Collects current values from the settings form fields.
 * @returns {object} The settings object.
 */
function collectSettingsFromForm() { // Internal helper
    const settings = {};
    if (openaiApiKeyInput) settings.openaiApiKey = openaiApiKeyInput.value;
    if (mainModelProviderSelect) settings.mainModelProvider = mainModelProviderSelect.value;
    if (mainModelNameInput) settings.mainModelName = mainModelNameInput.value;
    if (expertModelProviderSelect) settings.expertModelProvider = expertModelProviderSelect.value;
    if (expertModelNameInput) settings.expertModelName = expertModelNameInput.value;
    if (usePuppeteerCheckbox) settings.usePuppeteer = usePuppeteerCheckbox.checked;
    if (googleCseIdInput) settings.googleCseId = googleCseIdInput.value;
    if (googleApiKeyInput) settings.googleApiKey = googleApiKeyInput.value;
    if (enableCommandExecutionCheckbox) settings.enableCommandExecution = enableCommandExecutionCheckbox.checked;
    if (restrictFilesystemCheckbox) settings.restrictFilesystem = restrictFilesystemCheckbox.checked;
    if (enableWebAccessCheckbox) settings.enableWebAccess = enableWebAccessCheckbox.checked;
    return settings;
}

/** Saves the current settings from the form to the server. */
async function saveSettings() { // Internal helper, called by save button listener
    if (!settingsSaveButton || !settingsModal) return;
    const originalButtonText = settingsSaveButton.textContent;
    settingsSaveButton.disabled = true;
    settingsSaveButton.textContent = 'Saving...';
    setLoadingState(true); // Visually indicate saving

    try {
        const settings = collectSettingsFromForm();
        await api.saveSettingsToServer(settings);
        settingsModal.classList.remove('active');
        addAgentMessage("✅ Settings saved successfully.");
    } catch (error) {
        console.error('Error saving settings:', error);
        alert(`Error saving settings: ${error.message}`);
    } finally {
        settingsSaveButton.disabled = false;
        settingsSaveButton.textContent = originalButtonText;
        setLoadingState(false); // Remove loading state
    }
}

/** Helper to manage loading/saving state appearance */
function setLoadingState(isLoading) {
    const loadingIndicator = settingsModal?.querySelector('.settings-loading'); // Assuming .settings-loading exists
    if (loadingIndicator) {
        loadingIndicator.style.display = isLoading ? 'flex' : 'none';
    }
    const formElements = settingsModal?.querySelectorAll('input, select, button');
    if (formElements) {
        formElements.forEach(el => {
            // Don't disable the cancel button during load/save
            if (el.id !== 'settings-cancel') {
                el.disabled = isLoading;
            }
        });
        // Ensure save button state is correct after loading finishes
        if (!isLoading && settingsSaveButton) settingsSaveButton.disabled = false;
    }
}

/**
 * Shows the provider edit modal, optionally with pre-filled data
 * @param {Object} providerData - Optional provider data to pre-fill the form
 */
function showProviderEditModal(providerData = null) {
    if (!providerEditModal) return;
    
    // Update modal title based on mode
    if (providerEditTitle) {
        providerEditTitle.textContent = providerData ? 'Edit Provider' : 'Add Provider';
    }
    
    // Clear or pre-fill form fields
    if (providerNameInput) {
        providerNameInput.value = providerData ? providerData.name : '';
    }
    
    if (providerTypeSelect) {
        providerTypeSelect.value = providerData ? providerData.type : 'openai';
    }
    
    if (providerApiKeyInput) {
        providerApiKeyInput.value = providerData ? providerData.apiKey : '';
        providerApiKeyInput.type = 'password'; // Always reset to password type
        
        // Reset visibility icon if exists
        const visibilityIcon = providerEditModal.querySelector('.toggle-password .material-icons');
        if (visibilityIcon) {
            visibilityIcon.textContent = 'visibility_off';
        }
    }
    
    if (providerApiUrlInput) {
        providerApiUrlInput.value = providerData ? providerData.apiUrl : '';
    }
    
    // Show the modal with active class for animation
    providerEditModal.classList.add('active');
}

/**
 * Closes the provider edit modal
 */
function closeProviderEditModal() {
    if (!providerEditModal) return;
    providerEditModal.classList.remove('active');
}