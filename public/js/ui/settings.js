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
const providerSpecificSettingsContainer = document.getElementById('provider-specific-settings');
const providerEditCancelButton = document.getElementById('provider-edit-cancel');
const providerEditSaveButton = document.getElementById('provider-edit-save');
const addProviderButton = document.querySelector('.add-provider-btn');
const providersListElement = document.querySelector('.providers-list');

// LLM config elements
const auxModelProviderSelect = document.getElementById('auxModelProvider');
const auxModelNameInput = document.getElementById('auxModelName');
const mainModelProviderSelect = document.getElementById('mainModelProvider');
const mainModelNameInput = document.getElementById('mainModelName');
const expertModelProviderSelect = document.getElementById('expertModelProvider');
const expertModelNameInput = document.getElementById('expertModelName');

// Other settings elements
const usePuppeteerCheckbox = document.getElementById('usePuppeteer');
const googleCseIdInput = document.getElementById('googleCseId');
const googleApiKeyInput = document.getElementById('googleApiKey');
const enableCommandExecutionCheckbox = document.getElementById('enableCommandExecution');
const restrictFilesystemCheckbox = document.getElementById('restrictFilesystem');
const enableWebAccessCheckbox = document.getElementById('enableWebAccess');

// Store settings data
let settingsData = {};
let providerTypes = [];
// Map of provider type to settings array
let providerTypeSettings = {};
// Global models data that persists between UI operations
let globalModelsData = null;

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
    // No password toggle needed anymore - API key is a regular text field

    // Add provider button functionality
    if (addProviderButton) {
        addProviderButton.addEventListener('click', function() {
            showProviderEditModal();
        });
    }

    // Provider edit modal cancel button
    if (providerEditCancelButton) {
        providerEditCancelButton.addEventListener('click', function() {
            closeProviderEditModal();
        });
    }
}

/**
 * Loads settings schema and data, and displays the settings modal.
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
        // Get schema data (includes provider types and their settings)
        const schemaData = await api.loadSettingsSchema();
        if (schemaData.providerTypes) {
            providerTypes = schemaData.providerTypes;
            // Build map of provider type to settings
            providerTypeSettings = {};
            providerTypes.forEach(provider => {
                providerTypeSettings[provider.type] = provider.settings || [];
            });
            updateProviderTypeOptions();
        }
        
        // Load settings data
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

/**
 * Updates the provider type options in the provider edit modal and provider types list
 */
function updateProviderTypeOptions() {
    // Update provider type select dropdown in the edit modal
    if (providerTypeSelect) {
        // Store current value
        const currentValue = providerTypeSelect.value;
        
        // Clear options
        providerTypeSelect.innerHTML = '';
        
        // Add provider type options from API response only
        providerTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.type;
            option.textContent = type.name;
            providerTypeSelect.appendChild(option);
        });
        
        // Restore selected value if it exists in new options
        if (currentValue && [...providerTypeSelect.options].some(option => option.value === currentValue)) {
            providerTypeSelect.value = currentValue;
        } else if (providerTypeSelect.options.length > 0) {
            providerTypeSelect.value = providerTypeSelect.options[0].value;
        }
    }
    
    // Update provider types badges in the UI
    updateProviderTypesBadges();
}


/**
 * Updates the UI with the available provider types
 * This is called both at initialization and when new data is loaded
 */
function updateProviderTypesBadges() {
    const providerTypesList = document.querySelector('.provider-types-list');
    if (!providerTypesList) return;
    
    // Clear the list
    providerTypesList.innerHTML = '';
    
    // Use only provider types from API
    const typesToShow = providerTypes.map(t => t.type);
    
    // Add each type as a badge
    typesToShow.forEach(type => {
        const badge = document.createElement('span');
        badge.className = 'provider-type-badge';
        badge.textContent = type;
        providerTypesList.appendChild(badge);
    });
}

/**
 * Creates default models data when none exists
 * Per requirements, this is the only place where we initialize with a default structure
 * @returns {object} The default models configuration
 */
function createDefaultModelsData() {
    return {
        providers: [
            {
                name: 'OpenAI',
                type: 'openai',
                options: {
                    apiKey: '',
                    url: ''
                }
            }
        ],
        llmConfig: {
            aux: {
                provider: 'OpenAI',
                model: 'gpt-4.1-mini'
            },
            main: {
                provider: 'OpenAI',
                model: 'gpt-4.1'
            },
            expert: {
                provider: 'OpenAI',
                model: 'o3'
            }
        }
    };
}

/**
 * Populates the settings form fields with data loaded from the server.
 * @param {object} data - The settings data object.
 */
export function populateSettingsForm(data = {}) { // Export needed if called from socket error handler
    // Store the data
    settingsData = data;
    
    // Parse models data and store it globally
    try {
        // Parse models data if it exists and isn't empty
        if (typeof data.models === 'string' && data.models) {
            globalModelsData = JSON.parse(data.models);
            
            // Check that parsed data has expected structure
            if (!globalModelsData.providers || !Array.isArray(globalModelsData.providers)) {
                globalModelsData.providers = [];
            }
            
            if (!globalModelsData.llmConfig) {
                globalModelsData.llmConfig = {};
            }
            
            // If the structure is empty, use default data
            if (globalModelsData.providers.length === 0) {
                globalModelsData = createDefaultModelsData();
            }
        } else {
            // If no models data, use default
            globalModelsData = createDefaultModelsData();
        }
    } catch (error) {
        console.error('Error parsing models data:', error);
        globalModelsData = createDefaultModelsData();
    }
    
    console.log('Initial global models data:', globalModelsData);
    
    // Populate providers list
    populateProvidersList(globalModelsData.providers || []);
    
    // Populate LLM configs
    populateLlmConfigs(globalModelsData.providers || [], globalModelsData.llmConfig || {});
    
    // Web tab
    if (usePuppeteerCheckbox) usePuppeteerCheckbox.checked = data.usePuppeteer === true;
    if (googleCseIdInput) googleCseIdInput.value = data.googleCseId || '';
    if (googleApiKeyInput) googleApiKeyInput.value = data.googleApiKey || '';
    
    // Security tab
    if (enableCommandExecutionCheckbox) enableCommandExecutionCheckbox.checked = data.enableCommandExecution !== false;
    if (restrictFilesystemCheckbox) restrictFilesystemCheckbox.checked = data.restrictFilesystem === true;
    if (enableWebAccessCheckbox) enableWebAccessCheckbox.checked = data.enableWebAccess !== false;
}

/**
 * Populates the providers list in the UI
 * @param {Array} providers - The list of providers
 */
function populateProvidersList(providers) {
    if (!providersListElement) return;
    
    // Clear the list
    providersListElement.innerHTML = '';
    
    // Add each provider
    providers.forEach(provider => {
        const providerItem = document.createElement('div');
        providerItem.className = 'provider-item';
        providerItem.dataset.name = provider.name;
        providerItem.dataset.type = provider.type;
        
        providerItem.innerHTML = `
            <div class="provider-header">
                <span class="provider-name">${provider.name}</span>
                <div class="provider-info">
                    <span class="provider-type-label">${provider.type}</span>
                </div>
                <div class="provider-actions">
                    <button class="mini-button edit-provider" title="Edit"><span class="material-icons">edit</span></button>
                    <button class="mini-button delete-provider" title="Delete"><span class="material-icons">delete</span></button>
                </div>
            </div>
        `;
        
        providersListElement.appendChild(providerItem);
    });
    
    // Add event listeners for edit and delete buttons
    const editButtons = providersListElement.querySelectorAll('.edit-provider');
    editButtons.forEach(button => {
        button.addEventListener('click', function() {
            const providerItem = this.closest('.provider-item');
            const providerName = providerItem.dataset.name;
            const providerType = providerItem.dataset.type;
            
            const provider = providers.find(p => p.name === providerName);
            if (provider) {
                showProviderEditModal({
                    name: provider.name,
                    type: provider.type,
                    apiKey: provider.options?.apiKey || '',
                    apiUrl: provider.options?.url || '',
                    options: provider.options || {}
                });
            }
        });
    });
    
    const deleteButtons = providersListElement.querySelectorAll('.delete-provider');
    deleteButtons.forEach(button => {
        button.addEventListener('click', function() {
            const providerItem = this.closest('.provider-item');
            const providerName = providerItem.dataset.name;
            
            // Ensure global models data exists
            if (!globalModelsData) {
                globalModelsData = createDefaultModelsData();
            }
            
            // Filter out the provider with this name
            globalModelsData.providers = globalModelsData.providers.filter(p => p.name !== providerName);
            
            console.log('Global models data after provider deletion:', globalModelsData);
            
            // Update the UI
            populateProvidersList(globalModelsData.providers);
            populateLlmConfigs(globalModelsData.providers, globalModelsData.llmConfig);
        });
    });
}

/**
 * Populates the LLM configuration fields
 * @param {Array} providers - The list of providers
 * @param {object} llmConfig - The LLM configuration
 */
function populateLlmConfigs(providers, llmConfig) {
    // Populate provider selects
    populateProviderSelects(providers);
    
    // Set values for aux model
    if (auxModelProviderSelect && llmConfig.aux) {
        auxModelProviderSelect.value = llmConfig.aux.provider || '';
    }
    if (auxModelNameInput && llmConfig.aux) {
        auxModelNameInput.value = llmConfig.aux.model || '';
    }
    
    // Set values for main model
    if (mainModelProviderSelect && llmConfig.main) {
        mainModelProviderSelect.value = llmConfig.main.provider || '';
    }
    if (mainModelNameInput && llmConfig.main) {
        mainModelNameInput.value = llmConfig.main.model || '';
    }
    
    // Set values for expert model
    if (expertModelProviderSelect && llmConfig.expert) {
        expertModelProviderSelect.value = llmConfig.expert.provider || '';
    }
    if (expertModelNameInput && llmConfig.expert) {
        expertModelNameInput.value = llmConfig.expert.model || '';
    }
}

/**
 * Populates the provider select dropdowns
 * @param {Array} providers - The list of providers
 */
function populateProviderSelects(providers) {
    const selects = [auxModelProviderSelect, mainModelProviderSelect, expertModelProviderSelect];
    
    selects.forEach(select => {
        if (!select) return;
        
        // Store current value
        const currentValue = select.value;
        
        // Clear options
        select.innerHTML = '';
        
        // Add provider options - only actual providers from the list
        providers.forEach(provider => {
            const option = document.createElement('option');
            option.value = provider.name;
            option.textContent = provider.name;
            select.appendChild(option);
        });
        
        // Restore selected value if it exists in new options
        if (currentValue && [...select.options].some(option => option.value === currentValue)) {
            select.value = currentValue;
        } else if (select.options.length > 0) {
            // Select first option if no match
            select.value = select.options[0].value;
        }
    });
}

/**
 * Updates the global models data with current UI values
 * This updates only the LLM config part as providers are already managed directly
 */
function updateModelsDataFromUI() {
    // Ensure global models data exists
    if (!globalModelsData) {
        globalModelsData = createDefaultModelsData();
        return;
    }
    
    // Update LLM configs from the UI
    globalModelsData.llmConfig = {
        aux: {
            provider: auxModelProviderSelect ? auxModelProviderSelect.value : '',
            model: auxModelNameInput ? auxModelNameInput.value : ''
        },
        main: {
            provider: mainModelProviderSelect ? mainModelProviderSelect.value : '',
            model: mainModelNameInput ? mainModelNameInput.value : ''
        },
        expert: {
            provider: expertModelProviderSelect ? expertModelProviderSelect.value : '',
            model: expertModelNameInput ? expertModelNameInput.value : ''
        }
    };
    
    console.log('Updated global models data from UI:', globalModelsData);
}

/**
 * Collects current values from the settings form fields.
 * @returns {object} The settings object.
 */
function collectSettingsFromForm() { // Internal helper
    const settings = {};
    
    // Update global models data from UI
    updateModelsDataFromUI();
    
    // Get models data from global state
    settings.models = JSON.stringify(globalModelsData);
    
    // Web tab
    if (usePuppeteerCheckbox) settings.usePuppeteer = usePuppeteerCheckbox.checked;
    if (googleCseIdInput) settings.googleCseId = googleCseIdInput.value;
    if (googleApiKeyInput) settings.googleApiKey = googleApiKeyInput.value;
    
    // Security tab
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
        addAgentMessage("Settings saved successfully.");
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
    
    const isEditMode = !!providerData;
    
    // Update modal title based on mode
    if (providerEditTitle) {
        providerEditTitle.textContent = isEditMode ? 'Edit Provider' : 'Add Provider';
    }
    
    // Update save button text
    if (providerEditSaveButton) {
        providerEditSaveButton.textContent = isEditMode ? 'Save Provider' : 'Add Provider';
    }
    
    // Clear or pre-fill form fields
    if (providerNameInput) {
        providerNameInput.value = providerData ? providerData.name : '';
        // Store the original name for edit mode
        providerNameInput.dataset.originalName = providerData ? providerData.name : '';
    }
    
    if (providerTypeSelect) {
        const providerType = providerData ? providerData.type : (providerTypeSelect.options.length > 0 ? providerTypeSelect.options[0].value : 'openai');
        providerTypeSelect.value = providerType;
        // Update dynamic settings fields based on provider type
        updateProviderSpecificSettings(providerType, providerData ? providerData.options : {});
        
        // Add change listener to update fields when provider type changes
        providerTypeSelect.addEventListener('change', function() {
            updateProviderSpecificSettings(this.value, {});
        });
    }
    
    // Update save button event handler
    if (providerEditSaveButton) {
        // Remove any existing listeners
        providerEditSaveButton.removeEventListener('click', saveProviderData);
        // Add the listener
        providerEditSaveButton.addEventListener('click', saveProviderData);
    }
    
    // Show the modal with active class for animation
    providerEditModal.classList.add('active');
}

/**
 * Saves the provider data from the edit modal
 */
function saveProviderData() {
    if (!providerNameInput || !providerTypeSelect) return;
    
    const name = providerNameInput.value.trim();
    const type = providerTypeSelect.value;
    const originalName = providerNameInput.dataset.originalName || '';
    
    // Validate name
    if (!name) {
        alert('Provider name is required');
        return;
    }
    
    // Check for spaces in name
    if (name.includes(' ')) {
        alert('Provider name cannot contain spaces');
        return;
    }
    
    // Ensure global models data exists
    if (!globalModelsData) {
        globalModelsData = createDefaultModelsData();
    }
    
    // Check if name already exists (unless it's the same provider being edited)
    if (name !== originalName && globalModelsData.providers.some(p => p.name === name)) {
        alert('A provider with this name already exists');
        return;
    }
    
    // Create provider object with empty options
    const provider = {
        name,
        type,
        options: {}
    };
    
    // Add all settings from provider-specific fields
    const settings = providerTypeSettings[type] || [];
    settings.forEach(setting => {
        const input = document.getElementById(`provider-setting-${setting}`);
        if (input) {
            provider.options[setting] = input.value;
        }
    });
    
    console.log('Saving provider with options:', provider.options);
    
    // Update or add provider
    if (originalName) {
        // Edit existing provider
        globalModelsData.providers = globalModelsData.providers.map(p => 
            p.name === originalName ? provider : p
        );
        
        // Update the LLM config references if the name changed
        if (originalName !== name) {
            for (const configKey in globalModelsData.llmConfig) {
                if (globalModelsData.llmConfig[configKey].provider === originalName) {
                    globalModelsData.llmConfig[configKey].provider = name;
                }
            }
        }
    } else {
        // Add new provider
        globalModelsData.providers.push(provider);
    }
    
    console.log('Global models data after provider update:', globalModelsData);
    
    // Update UI
    populateProvidersList(globalModelsData.providers);
    populateLlmConfigs(globalModelsData.providers, globalModelsData.llmConfig);
    
    // Close modal
    closeProviderEditModal();
}

/**
 * Updates the provider-specific settings fields based on the selected provider type
 * @param {string} providerType - The selected provider type
 * @param {object} currentValues - Current values for the fields, if any
 */
function updateProviderSpecificSettings(providerType, currentValues = {}) {
    if (!providerSpecificSettingsContainer) return;
    
    // Clear existing fields
    providerSpecificSettingsContainer.innerHTML = '';
    
    // Get settings for this provider type
    const settings = providerTypeSettings[providerType] || [];
    
    // Create a field for each setting
    settings.forEach(setting => {
        const formGroup = document.createElement('div');
        formGroup.className = 'settings-form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', `provider-setting-${setting}`);
        label.textContent = setting.charAt(0).toUpperCase() + setting.slice(1); // Capitalize first letter
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `provider-setting-${setting}`;
        input.placeholder = `Enter ${setting}`;
        input.value = currentValues[setting] || '';
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        providerSpecificSettingsContainer.appendChild(formGroup);
    });
}

/**
 * Closes the provider edit modal
 */
function closeProviderEditModal() {
    if (!providerEditModal) return;
    providerEditModal.classList.remove('active');
}