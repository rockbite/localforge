// Settings dialog functionality
class SettingsUI {
    constructor() {
        this.dialog = document.getElementById('settings-modal');
        this.tabButtons = document.querySelectorAll('.settings-tab-button');
        this.tabContents = document.querySelectorAll('.settings-tab-content');
        this.cancelButton = document.getElementById('settings-cancel');
        this.saveButton = document.getElementById('settings-save');

        // Theme and appearance elements
        this.themeSelect = document.getElementById('theme-select');
        
        // Theme is now applied by theme-loader.js on page load
        // No need to apply default theme here
        
        this.setupEventListeners();
        this.loadSettings();
    }

    setupEventListeners() {
        // Tab navigation
        this.tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.openTab(button.dataset.tab);
            });
        });

        // Close dialog
        this.cancelButton.addEventListener('click', () => {
            this.closeDialog();
        });

        // Save settings
        this.saveButton.addEventListener('click', () => {
            this.saveSettings();
        });

        // Theme selector
        if (this.themeSelect) {
            this.themeSelect.addEventListener('change', () => {
                this.applyTheme(this.themeSelect.value);
            });
        }
        
        // Provider edit modal functionality
        this.initProviderEditModal();
    }
    

    openDialog() {
        this.dialog.classList.add('active');
        this.openTab('models'); // Default tab
        this.loadSettings();
    }

    closeDialog() {
        this.dialog.classList.remove('active');
    }

    openTab(tabId) {
        // Hide all tabs and deactivate all buttons
        this.tabContents.forEach(content => {
            content.style.visibility = 'hidden';
            content.style.position = 'absolute';
            content.style.zIndex = '-1';
        });
        
        this.tabButtons.forEach(button => {
            button.classList.remove('active');
        });
        
        // Activate the selected tab and button
        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.style.visibility = 'visible';
            tabContent.style.position = 'relative';
            tabContent.style.zIndex = '1';
        }
        document.querySelector(`.settings-tab-button[data-tab="${tabId}"]`).classList.add('active');
    }

    loadSettings() {
        // Load current settings from API
        fetch('/api/settings').then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load settings: ${response.statusText}`);
            }
            return response.json();
        }).then(settings => {
            // Populate form with settings
            this.populateModelSettings(settings);
            this.populateWebSettings(settings);
            this.populateSecuritySettings(settings);
            this.populateThemeSettings(settings);
            
            // Parse models data
            if (settings.models && typeof settings.models === 'string') {
                try {
                    const modelsData = JSON.parse(settings.models);
                    this.populateProvidersData(modelsData);
                } catch (error) {
                    console.error('Error parsing models data:', error);
                }
            }
        }).catch(error => {
            console.error('Error loading settings:', error);
        });
    }
    
    populateProvidersData(modelsData) {
        // Store global data
        this.globalModelsData = modelsData;

        // Populate providers list
        if (modelsData.providers && Array.isArray(modelsData.providers)) {
            const providersListElement = document.querySelector('.providers-list');
            if (providersListElement) {
                providersListElement.innerHTML = '';
                
                modelsData.providers.forEach(provider => {
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
                providersListElement.querySelectorAll('.edit-provider').forEach(button => {
                    button.addEventListener('click', () => {
                        const providerItem = button.closest('.provider-item');
                        const providerName = providerItem.dataset.name;
                        const providerType = providerItem.dataset.type;
                        
                        const provider = modelsData.providers.find(p => p.name === providerName);
                        if (provider) {
                            this.showProviderEditModal({
                                name: provider.name,
                                type: provider.type,
                                apiKey: provider.options?.apiKey || '',
                                apiUrl: provider.options?.url || '',
                                options: provider.options || {}
                            });
                        }
                    });
                });
                
                providersListElement.querySelectorAll('.delete-provider').forEach(button => {
                    button.addEventListener('click', () => {
                        const providerItem = button.closest('.provider-item');
                        const providerName = providerItem.dataset.name;
                        
                        // Remove from global data
                        if (this.globalModelsData && this.globalModelsData.providers) {
                            this.globalModelsData.providers = this.globalModelsData.providers.filter(p => p.name !== providerName);
                            
                            // Update the UI
                            this.populateProvidersData(this.globalModelsData);
                        } else {
                            providerItem.remove();
                        }
                    });
                });
                
                // Add event handler for the add provider button
                const addProviderButton = document.querySelector('.add-provider-btn');
                if (addProviderButton) {
                    addProviderButton.removeEventListener('click', this.showProviderEditModal);
                    addProviderButton.addEventListener('click', () => {
                        this.showProviderEditModal();
                    });
                }
            }
        }
        
        // Populate model selectors
        if (modelsData.llmConfig) {
            const llmConfig = modelsData.llmConfig;
            
            // Populate provider selects
            const providerSelects = [
                document.getElementById('auxModelProvider'),
                document.getElementById('mainModelProvider'),
                document.getElementById('expertModelProvider')
            ];
            
            providerSelects.forEach(select => {
                if (!select) return;
                
                // Clear options
                select.innerHTML = '';
                
                // Add provider options
                if (modelsData.providers && Array.isArray(modelsData.providers)) {
                    modelsData.providers.forEach(provider => {
                        const option = document.createElement('option');
                        option.value = provider.name;
                        option.textContent = provider.name;
                        select.appendChild(option);
                    });
                }
            });
            
            // Set values for each model
            if (llmConfig.aux) {
                const auxModelProviderSelect = document.getElementById('auxModelProvider');
                const auxModelNameInput = document.getElementById('auxModelName');
                
                if (auxModelProviderSelect) auxModelProviderSelect.value = llmConfig.aux.provider || '';
                if (auxModelNameInput) auxModelNameInput.value = llmConfig.aux.model || '';
            }
            
            if (llmConfig.main) {
                const mainModelProviderSelect = document.getElementById('mainModelProvider');
                const mainModelNameInput = document.getElementById('mainModelName');
                
                if (mainModelProviderSelect) mainModelProviderSelect.value = llmConfig.main.provider || '';
                if (mainModelNameInput) mainModelNameInput.value = llmConfig.main.model || '';
            }
            
            if (llmConfig.expert) {
                const expertModelProviderSelect = document.getElementById('expertModelProvider');
                const expertModelNameInput = document.getElementById('expertModelName');
                
                if (expertModelProviderSelect) expertModelProviderSelect.value = llmConfig.expert.provider || '';
                if (expertModelNameInput) expertModelNameInput.value = llmConfig.expert.model || '';
            }
        }
    }

    populateModelSettings(settings) {
        // Populate model settings fields
        if (settings.provider) {
            document.getElementById('provider-select').value = settings.provider;
        }
        
        if (settings.apiKey) {
            document.getElementById('api-key-input').value = settings.apiKey;
        }
        
        if (settings.baseUrl) {
            document.getElementById('base-url-input').value = settings.baseUrl;
        }
        
        if (settings.model) {
            document.getElementById('model-name-input').value = settings.model;
        }
    }

    populateWebSettings(settings) {
        // Populate web settings fields
        if (settings.webAccess !== undefined) {
            document.getElementById('web-access-toggle').checked = settings.webAccess;
        }
        
        // Populate Puppeteer checkbox
        const usePuppeteerCheckbox = document.getElementById('usePuppeteer');
        if (usePuppeteerCheckbox && settings.usePuppeteer !== undefined) {
            usePuppeteerCheckbox.checked = settings.usePuppeteer === true;
        }
        
        // Populate Google CSE ID
        const googleCseIdInput = document.getElementById('googleCseId');
        if (googleCseIdInput && settings.googleCseId) {
            googleCseIdInput.value = settings.googleCseId;
        }
        
        // Populate Google API Key
        const googleApiKeyInput = document.getElementById('googleApiKey');
        if (googleApiKeyInput && settings.googleApiKey) {
            googleApiKeyInput.value = settings.googleApiKey;
        }
    }

    populateSecuritySettings(settings) {
        // Populate security settings fields
        if (settings.allowUnsafe !== undefined) {
            document.getElementById('allow-unsafe-toggle').checked = settings.allowUnsafe;
        }
        
        if (settings.disableExecutables !== undefined) {
            document.getElementById('disable-executables-toggle').checked = settings.disableExecutables;
        }
        
        if (settings.localNetworkAccess !== undefined) {
            document.getElementById('local-network-toggle').checked = settings.localNetworkAccess;
        }
    }

    populateThemeSettings(settings) {
        // Populate theme settings if the theme selector exists
        if (this.themeSelect && settings.theme) {
            this.themeSelect.value = settings.theme;
        }
    }

    saveSettings() {
        // Gather settings from form
        const settings = {
            // Basic model settings
            provider: document.getElementById('provider-select')?.value,
            apiKey: document.getElementById('api-key-input')?.value,
            baseUrl: document.getElementById('base-url-input')?.value,
            model: document.getElementById('model-name-input')?.value,
            
            // Web access settings
            webAccess: document.getElementById('web-access-toggle')?.checked,
            usePuppeteer: document.getElementById('usePuppeteer')?.checked,
            googleCseId: document.getElementById('googleCseId')?.value,
            googleApiKey: document.getElementById('googleApiKey')?.value,
            
            // Security settings
            allowUnsafe: document.getElementById('allow-unsafe-toggle')?.checked,
            disableExecutables: document.getElementById('disable-executables-toggle')?.checked,
            localNetworkAccess: document.getElementById('local-network-toggle')?.checked
        };

        // Add theme settings if theme selector exists
        if (this.themeSelect) {
            settings.theme = this.themeSelect.value;
        }
        
        // Update LLM configuration in global models data
        if (this.globalModelsData) {
            this.globalModelsData.llmConfig = {
                aux: {
                    provider: document.getElementById('auxModelProvider')?.value || '',
                    model: document.getElementById('auxModelName')?.value || ''
                },
                main: {
                    provider: document.getElementById('mainModelProvider')?.value || '',
                    model: document.getElementById('mainModelName')?.value || ''
                },
                expert: {
                    provider: document.getElementById('expertModelProvider')?.value || '',
                    model: document.getElementById('expertModelName')?.value || ''
                }
            };
            
            // Add models data as a string
            settings.models = JSON.stringify(this.globalModelsData);
        } else {
            // Create models data object if none exists
            const modelsData = {
                providers: [],
                llmConfig: {
                    aux: {
                        provider: document.getElementById('auxModelProvider')?.value || '',
                        model: document.getElementById('auxModelName')?.value || ''
                    },
                    main: {
                        provider: document.getElementById('mainModelProvider')?.value || '',
                        model: document.getElementById('mainModelName')?.value || ''
                    },
                    expert: {
                        provider: document.getElementById('expertModelProvider')?.value || '',
                        model: document.getElementById('expertModelName')?.value || ''
                    }
                }
            };
            
            // Collect providers from the list
            const providerItems = document.querySelectorAll('.provider-item');
            providerItems.forEach(item => {
                modelsData.providers.push({
                    name: item.dataset.name,
                    type: item.dataset.type,
                    options: {} // This is a fallback, should never be needed since we're tracking options
                });
            });
            
            // Add models data as a string
            settings.models = JSON.stringify(modelsData);
        }

        // Save settings via API
        fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        }).then(response => {
            if (!response.ok) {
                throw new Error(`Failed to save settings: ${response.statusText}`);
            }
            return response.json();
        }).then(() => {
            // Apply theme if it was changed
            if (this.themeSelect) {
                this.applyTheme(this.themeSelect.value);
            }
            
            this.closeDialog();
            
            // Show success notification
            if (typeof showNotification === 'function') {
                showNotification('Settings saved successfully', 'check_circle', 'success');
            } else {
                console.log('Settings saved successfully');
            }
        }).catch(err => {
            console.error('Error saving settings:', err);
            if (typeof showNotification === 'function') {
                showNotification('Failed to save settings', 'error', 'error');
            } else {
                console.error('Failed to save settings');
            }
        });
    }

    applyTheme(themeName) {
        // Reuse the global applyTheme function from theme-loader.js if available
        if (typeof window.applyTheme === 'function') {
            window.applyTheme(themeName);
            return;
        }
        
        // Fallback implementation if the global function isn't available
        // Remove any existing theme stylesheets
        const existingThemeLink = document.getElementById('theme-stylesheet');
        if (existingThemeLink) {
            existingThemeLink.remove();
        }

        // Add the new theme stylesheet if not using default theme
        if (themeName && themeName !== 'dark') {
            const link = document.createElement('link');
            link.id = 'theme-stylesheet';
            link.rel = 'stylesheet';
            link.href = `/css/themes/_${themeName}-theme.css`;
            document.head.appendChild(link);
        }
        
        // Apply the theme to the HTML element
        document.documentElement.dataset.theme = themeName;
    }
    
}

// Initialize settings UI when document is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.settingsUI = new SettingsUI();
    
    // Load settings schema and provider data
    fetch('/api/settings/schema').then(response => {
        if (!response.ok) {
            throw new Error(`Failed to load settings schema: ${response.statusText}`);
        }
        return response.json();
    }).then(schemaData => {
        if (schemaData.providerTypes) {
            // Update provider types in UI
            const providerTypesList = document.querySelector('.provider-types-list');
            if (providerTypesList) {
                providerTypesList.innerHTML = '';
                schemaData.providerTypes.forEach(type => {
                    const badge = document.createElement('span');
                    badge.className = 'provider-type-badge';
                    badge.textContent = type.type;
                    providerTypesList.appendChild(badge);
                });
            }
            
            // Update provider type select
            const providerTypeSelect = document.getElementById('providerType');
            if (providerTypeSelect) {
                providerTypeSelect.innerHTML = '';
                schemaData.providerTypes.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type.type;
                    option.textContent = type.name;
                    providerTypeSelect.appendChild(option);
                });
            }
        }
    }).catch(error => {
        console.error('Error loading settings schema:', error);
    });
});

// Add the missing provider edit modal implementation
SettingsUI.prototype.initProviderEditModal = function() {
    // Get provider edit modal elements
    this.providerEditModal = document.getElementById('provider-edit-modal');
    this.providerEditTitle = document.getElementById('provider-edit-title');
    this.providerNameInput = document.getElementById('providerName');
    this.providerTypeSelect = document.getElementById('providerType');
    this.providerSpecificSettingsContainer = document.getElementById('provider-specific-settings');
    this.providerEditCancelButton = document.getElementById('provider-edit-cancel');
    this.providerEditSaveButton = document.getElementById('provider-edit-save');
    
    // Add provider button functionality
    const addProviderButton = document.querySelector('.add-provider-btn');
    if (addProviderButton) {
        addProviderButton.addEventListener('click', () => {
            this.showProviderEditModal();
        });
    }
    
    // Provider edit modal cancel button
    if (this.providerEditCancelButton) {
        this.providerEditCancelButton.addEventListener('click', () => {
            this.closeProviderEditModal();
        });
    }
    
    // Provider edit modal save button
    if (this.providerEditSaveButton) {
        this.providerEditSaveButton.addEventListener('click', () => {
            this.saveProviderData();
        });
    }
    
    // Add type change listener
    if (this.providerTypeSelect) {
        this.providerTypeSelect.addEventListener('change', () => {
            this.updateProviderSpecificSettings(this.providerTypeSelect.value, {});
        });
    }
};

SettingsUI.prototype.showProviderEditModal = function(providerData = null) {
    if (!this.providerEditModal) return;
    
    const isEditMode = !!providerData;
    
    // Update modal title based on mode
    if (this.providerEditTitle) {
        this.providerEditTitle.textContent = isEditMode ? 'Edit Provider' : 'Add Provider';
    }
    
    // Update save button text
    if (this.providerEditSaveButton) {
        this.providerEditSaveButton.textContent = isEditMode ? 'Save Provider' : 'Add Provider';
    }
    
    // Clear or pre-fill form fields
    if (this.providerNameInput) {
        this.providerNameInput.value = providerData ? providerData.name : '';
        // Store the original name for edit mode
        this.providerNameInput.dataset.originalName = providerData ? providerData.name : '';
    }
    
    if (this.providerTypeSelect) {
        const providerType = providerData ? providerData.type : (this.providerTypeSelect.options.length > 0 ? this.providerTypeSelect.options[0].value : 'openai');
        this.providerTypeSelect.value = providerType;
        // Update dynamic settings fields based on provider type
        this.updateProviderSpecificSettings(providerType, providerData ? providerData.options : {});
    }
    
    // Show the modal with active class for animation
    this.providerEditModal.classList.add('active');
};

SettingsUI.prototype.closeProviderEditModal = function() {
    if (!this.providerEditModal) return;
    this.providerEditModal.classList.remove('active');
};

SettingsUI.prototype.updateProviderSpecificSettings = function(providerType, currentValues = {}) {
    if (!this.providerSpecificSettingsContainer) return;
    
    // Clear existing fields
    this.providerSpecificSettingsContainer.innerHTML = '';
    
    // Get settings for this provider type from schema
    // We'll use a simple approach for now - common fields for all providers
    const settings = ['apiKey', 'url'];
    
    // Create a field for each setting
    settings.forEach(setting => {
        const formGroup = document.createElement('div');
        formGroup.className = 'settings-form-group';
        
        const label = document.createElement('label');
        label.setAttribute('for', `provider-setting-${setting}`);
        label.textContent = setting === 'apiKey' ? 'API Key' : 'API URL';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.id = `provider-setting-${setting}`;
        input.placeholder = `Enter ${setting === 'apiKey' ? 'API Key' : 'API URL'}`;
        input.value = currentValues[setting] || '';
        
        formGroup.appendChild(label);
        formGroup.appendChild(input);
        this.providerSpecificSettingsContainer.appendChild(formGroup);
    });
};

SettingsUI.prototype.saveProviderData = function() {
    if (!this.providerNameInput || !this.providerTypeSelect) return;
    
    const name = this.providerNameInput.value.trim();
    const type = this.providerTypeSelect.value;
    const originalName = this.providerNameInput.dataset.originalName || '';
    
    // Validate name
    if (!name) {
        alert('Provider name is required');
        return;
    }
    
    // Ensure global models data exists
    if (!this.globalModelsData) {
        this.globalModelsData = {
            providers: [],
            llmConfig: {
                aux: { provider: '', model: '' },
                main: { provider: '', model: '' },
                expert: { provider: '', model: '' }
            }
        };
    }
    
    // Check if name already exists (unless it's the same provider being edited)
    if (name !== originalName && this.globalModelsData.providers.some(p => p.name === name)) {
        alert('A provider with this name already exists');
        return;
    }
    
    // Create provider object with empty options
    const provider = {
        name,
        type,
        options: {}
    };
    
    // Add settings from provider-specific fields
    const settings = ['apiKey', 'url']; // Same as in updateProviderSpecificSettings
    settings.forEach(setting => {
        const input = document.getElementById(`provider-setting-${setting}`);
        if (input) {
            provider.options[setting] = input.value;
        }
    });
    
    // Update or add provider
    if (originalName) {
        // Edit existing provider
        this.globalModelsData.providers = this.globalModelsData.providers.map(p => 
            p.name === originalName ? provider : p
        );
        
        // Update the LLM config references if the name changed
        if (originalName !== name) {
            for (const configKey in this.globalModelsData.llmConfig) {
                if (this.globalModelsData.llmConfig[configKey].provider === originalName) {
                    this.globalModelsData.llmConfig[configKey].provider = name;
                }
            }
        }
    } else {
        // Add new provider
        this.globalModelsData.providers.push(provider);
    }
    
    // Update UI
    this.populateProvidersData(this.globalModelsData);
    
    // Close modal
    this.closeProviderEditModal();
};

// Add global method to open settings dialog
function openSettings() {
    window.settingsUI.openDialog();
}

// Add exports for module imports
export function populateSettingsForm(settings) {
    if (window.settingsUI) {
        window.settingsUI.populateModelSettings(settings);
        window.settingsUI.populateWebSettings(settings);
        window.settingsUI.populateSecuritySettings(settings);
        window.settingsUI.populateThemeSettings(settings);
    }
}

export function showSettingsModal() {
    if (window.settingsUI) {
        window.settingsUI.openDialog();
    }
}