// Agent Modal - Edit Agent Data
// This module provides a modal for editing agent data with a rich UI

// Import utilities
import { showConfirmationModal, showNotification } from '../utils.js';

class AgentModal {
    constructor() {
        // Modal elements
        this.modal = document.getElementById('agent-modal');
        this.closeButton = document.getElementById('agent-modal-close');
        
        // Agent info inputs
        this.nameInput = document.getElementById('agent-name-input');
        this.descriptionInput = document.getElementById('agent-description-input');
        
        // LLM config inputs
        this.mainProviderSelect = document.getElementById('am-main-provider');
        this.mainModelInput = document.getElementById('am-main-model');
        this.expertProviderSelect = document.getElementById('am-expert-provider');
        this.expertModelInput = document.getElementById('am-expert-model');
        this.auxProviderSelect = document.getElementById('am-aux-provider');
        this.auxModelInput = document.getElementById('am-aux-model');
        
        // Tools container
        this.toolsContainer = document.getElementById('agent-tools-list');
        
        // Tabs
        this.tabsList = document.getElementById('agent-tabs-list');
        this.addTabButton = document.getElementById('add-tab-button');
        
        // Prompt editor
        this.promptEditorContainer = document.getElementById('agent-prompt-editor');
        this.noPromptsMessage = document.getElementById('no-prompts-message');
        this.promptEditor = null; // Will be initialized when modal is opened
        
        // Editor libraries
        this.loadCodeMirror();
        
        // Current agent data
        this.currentAgentId = null;
        this.currentAgent = null;
        this.availableTools = [];
        this.currentTabId = null;
        this.availableProviders = [];
        
        // Initialize event listeners
        this.initEventListeners();
        this.fetchAvailableTools();
        this.fetchProvidersList();

        // Listen for provider updates coming from settings dialog
        window.addEventListener('providersUpdated', (e) => {
            if (Array.isArray(e.detail)) {
                this.availableProviders = e.detail;
                this.populateProviderDropdowns();
            } else {
                // Fallback: re-fetch if detail missing
                this.fetchProvidersList();
            }
        });
    }
    
    loadCodeMirror() {
        // Reusing the existing prompt-editor.js loaded in the main app
        // No need to load CodeMirror separately as it's already loaded by prompt-editor
    }
    
    initEventListeners() {
        // Close button click
        if (this.closeButton) {
            this.closeButton.addEventListener('click', () => {
                this.saveAgentData();
                this.closeModal();
            });
        }
        
        // Add tab button click
        if (this.addTabButton) {
            this.addTabButton.addEventListener('click', () => {
                this.addNewTab();
            });
        }
        
        // Add keyboard shortcut for saving (Cmd+S or Ctrl+S)
        document.addEventListener('keydown', (e) => {
            if (this.modal && this.modal.classList.contains('active') && (e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault(); // Prevent browser save dialog
                this.saveAgentData(true); // Pass true to show notification
            }
        });
    }
    
    fetchAvailableTools() {
        fetch('/api/agents/tools')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load tools: ${response.statusText}`);
                }
                return response.json();
            })
            .then(tools => {
                if (Array.isArray(tools)) {
                    this.availableTools = tools;
                } else {
                    console.error('Expected tools to be an array but got:', typeof tools);
                    this.availableTools = [];
                }
            })
            .catch(error => {
                console.error('Error loading tools:', error);
                this.availableTools = [];
            });
    }
    
    initializePromptEditor() {
        // Initialize prompt editor if not already initialized
        if (!this.promptEditor && typeof promptEditorBoot === 'function') {
            this.promptEditor = promptEditorBoot(this.promptEditorContainer, {
                placeholder: 'Enter prompt text here...'
            });
            console.log("Agent modal prompt editor initialized");
        }
    }
    
    openModal(agentId) {
        if (!this.modal) return;

        this.currentAgentId = agentId;

        // Always refresh providers *before* showing data to ensure dropdowns are up-to-date
        this.fetchProvidersList().finally(() => {
            // Show the modal only after providers are refreshed to avoid flicker
            this.modal.classList.add('active');

            this.initializePromptEditor();
            this.loadAgentData(agentId);
        });
    }
    
    closeModal() {
        if (!this.modal) return;
        
        // Remove focus from any buttons or elements inside the modal before hiding it
        // This helps prevent accessibility issues with aria-hidden and focus
        const activeElement = document.activeElement;
        if (activeElement && this.modal.contains(activeElement)) {
            activeElement.blur();
        }
        
        this.modal.classList.remove('active');
        this.currentAgentId = null;
        this.currentTabId = null;
    }
    
    // Fetch the latest providers list from the server.
    // Returns a promise that resolves when the dropdowns are populated.
    fetchProvidersList() {
        return fetch('/api/settings')
            .then(response => {
                const json = response.json();
                if (!response.ok) {
                    throw new Error(`Failed to load settings data: ${response.statusText}`);
                }
                return json;
            })
            .then(data => {
                // Ensure models are parsed (api stores JSON string)
                if (typeof data.models === 'string') {
                    try {
                        data.models = JSON.parse(data.models);
                    } catch (_) {
                        data.models = {};
                    }
                }

                let providersFromServer = Array.isArray(data.models?.providers) ? data.models.providers : [];

                // Merge with in-memory providers that may not be saved yet (settings dialog still open)
                if (window.settingsUI?.globalModelsData?.providers) {
                    const memProviders = window.settingsUI.globalModelsData.providers;
                    // Combine and deduplicate by name
                    const map = new Map();
                    [...providersFromServer, ...memProviders].forEach(p => {
                        map.set(p.name, p);
                    });
                    providersFromServer = Array.from(map.values());
                }

                this.availableProviders = providersFromServer;

                // Populate provider dropdowns with the fresh list
                this.populateProviderDropdowns();
            })
            .catch(error => {
                console.error('Error loading providers:', error);
            });
    }
    
    populateProviderDropdowns() {
        const providerSelects = [
            this.mainProviderSelect,
            this.expertProviderSelect,
            this.auxProviderSelect
        ];
        
        providerSelects.forEach(select => {
            if (!select) return;
            
            // Clear options
            select.innerHTML = '';
            
            // Add provider options
            this.availableProviders.forEach(provider => {
                const option = document.createElement('option');
                option.value = provider.name;
                option.textContent = provider.name;
                select.appendChild(option);
            });
        });
    }
    
    loadAgentData(agentId) {
        fetch(`/api/agents/${agentId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load agent: ${response.statusText}`);
                }
                return response.json();
            })
            .then(agent => {
                this.currentAgent = agent;
                this.renderAgentData(agent);
            })
            .catch(error => {
                console.error('Error loading agent:', error);
                this.closeModal();
            });
    }
    
    renderAgentData(agent) {
        // Set basic info
        if (this.nameInput) this.nameInput.value = agent.name || '';
        // Check both locations for description - prefer root level, fall back to agent.description
        if (this.descriptionInput) this.descriptionInput.value = agent.description || agent.agent?.description || '';
        
        // Set LLM configurations if they exist
        const llms = agent.agent.llms || {};

        if (llms.main) {
            if (this.mainProviderSelect) this.mainProviderSelect.value = llms.main.provider;
            if (this.mainModelInput) this.mainModelInput.value = llms.main.model;
        }
        
        if (llms.expert) {
            if (this.expertProviderSelect) this.expertProviderSelect.value = llms.expert.provider;
            if (this.expertModelInput) this.expertModelInput.value = llms.expert.model;
        }

        if (llms.aux) {
            if (this.auxProviderSelect) this.auxProviderSelect.value = llms.aux.provider;
            if (this.auxModelInput) this.auxModelInput.value = llms.aux.model;
        }
        
        // Render tools list
        this.renderToolsList(agent.agent?.tool_list || []);
        
        // Render prompt tabs
        this.renderPromptTabs(agent.agent?.['prompt-overrides'] || {});
    }
    
    renderToolsList(selectedTools) {
        if (!this.toolsContainer) return;
        
        // Clear current tools
        this.toolsContainer.innerHTML = '';
        
        // Create a tool item for each available tool
        this.availableTools.forEach(toolName => {
            const isSelected = selectedTools.includes(toolName);
            
            const toolItem = document.createElement('div');
            toolItem.className = 'tool-item';
            
            toolItem.innerHTML = `
                <label>
                    <input type="checkbox" class="tool-checkbox" data-tool="${toolName}" ${isSelected ? 'checked' : ''}>
                    <span>${toolName}</span>
                </label>
            `;
            
            this.toolsContainer.appendChild(toolItem);
        });
    }
    
    renderPromptTabs(promptOverrides, tabToSelectId = null) {
        if (!this.tabsList) return;
        
        // Clear current tabs
        this.tabsList.innerHTML = '';
        
        const tabIds = Object.keys(promptOverrides);
        
        // Create a tab for each prompt override
        for (const [tabId, _] of Object.entries(promptOverrides)) {
            this.addTabToUI(tabId);
        }
        
        // If there are tabs, select one
        if (tabIds.length > 0) {
            let finalTabToSelect = null;
            
            // Determine which tab to select
            if (tabToSelectId && promptOverrides.hasOwnProperty(tabToSelectId)) {
                finalTabToSelect = tabToSelectId;
            } else {
                // Default to first tab if preferred one isn't available
                finalTabToSelect = tabIds[0];
            }
            
            // Show editor, hide empty message
            if (this.promptEditorContainer) this.promptEditorContainer.style.display = 'block';
            if (this.noPromptsMessage) this.noPromptsMessage.style.display = 'none';
            
            // Set tab as active and load its content (without saving current content)
            this.performTabSelection(finalTabToSelect);
        } else {
            // Clear the editor if there are no tabs
            if (this.promptEditor) {
                const textEditor = this.promptEditor.getTextEditor();
                if (textEditor) {
                    textEditor.setValue('');
                }
            }
            this.currentTabId = null;
            
            // Hide editor, show empty message
            if (this.promptEditorContainer) this.promptEditorContainer.style.display = 'none';
            if (this.noPromptsMessage) this.noPromptsMessage.style.display = 'flex';
        }
    }
    
    performTabSelection(tabId) {
        if (!tabId || !this.currentAgent?.agent?.['prompt-overrides']?.hasOwnProperty(tabId)) {
            console.warn(`Invalid tab ID: ${tabId}`);
            return;
        }
        
        // Update UI classes
        const tabs = this.tabsList.querySelectorAll('.agent-tab');
        tabs.forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tabId === tabId) {
                tab.classList.add('active');
            }
        });
        
        // Set current tab ID
        this.currentTabId = tabId;
        
        // Load content for selected tab
        const content = this.currentAgent.agent['prompt-overrides'][tabId] || '';
        
        if (this.promptEditor) {
            // Load content into the prompt editor
            const textEditor = this.promptEditor.getTextEditor();
            if (textEditor) {
                textEditor.setValue(content);
            }
            
            // Also load into block editor for consistency
            const ptJson = { blocks: [{ 
                id: Math.random().toString(16).slice(2, 8), 
                content: content,
                muted: false 
            }]};
            this.promptEditor.blockEditor.loadFromPTJson(ptJson);
            
            // Switch to text tab initially
            const textTab = this.promptEditorContainer.querySelector('.tab[data-tab="text"]');
            if (textTab) {
                textTab.click();
            }
        }
    }
    
    addTabToUI(tabId) {
        const tab = document.createElement('div');
        tab.className = 'agent-tab';
        tab.dataset.tabId = tabId;
        
        tab.innerHTML = `
            <span class="agent-tab-name">${tabId}</span>
            <span class="material-icons agent-tab-delete">delete</span>
        `;
        
        this.tabsList.appendChild(tab);
        
        // Add event listeners
        tab.addEventListener('click', (e) => {
            // Don't select tab if delete button was clicked
            if (e.target.classList.contains('agent-tab-delete')) return;
            this.selectTab(tabId);
        });
        
        // Double click to rename tab
        tab.addEventListener('dblclick', () => {
            this.startRenamingTab(tabId);
        });
        
        // Delete tab button
        const deleteButton = tab.querySelector('.agent-tab-delete');
        if (deleteButton) {
            deleteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteTab(tabId);
            });
        }
        
        return tab;
    }
    
    selectTab(tabId) {
        if (!this.currentAgent?.agent?.['prompt-overrides']) return;
        
        // Don't do anything if the tab is already selected
        if (tabId === this.currentTabId) return;
        
        // Save current tab content before switching
        this.saveCurrentTabContent();
        
        // Use the helper method to perform the actual selection
        this.performTabSelection(tabId);
    }
    
    saveCurrentTabContent() {
        if (!this.currentTabId || !this.promptEditor) return;
        
        // Get content from editor - using the prompt editor API
        let content = '';
        
        // Check which tab is active
        const activeTab = this.promptEditorContainer.querySelector('.tab.active');
        if (activeTab && activeTab.dataset.tab === 'text') {
            // Get text from the plain text editor
            const textEditor = this.promptEditor.getTextEditor();
            if (textEditor) {
                content = textEditor.getValue();
            }
        } else {
            // Get text from blocks editor
            const json = this.promptEditor.blockEditor.getPTJson();
            if (json && json.blocks) {
                content = json.blocks
                    .filter(block => !block.muted)
                    .map(block => block.content)
                    .join('\n\n')
                    .trim();
            }
        }
        
        // Update agent data
        if (!this.currentAgent.agent) this.currentAgent.agent = {};
        if (!this.currentAgent.agent['prompt-overrides']) this.currentAgent.agent['prompt-overrides'] = {};
        
        this.currentAgent.agent['prompt-overrides'][this.currentTabId] = content;
    }
    
    addNewTab() {
        // Generate a unique tab ID
        let tabId = 'new-prompt';
        let counter = 1;
        
        while (this.currentAgent?.agent?.['prompt-overrides']?.[tabId]) {
            tabId = `new-prompt-${counter++}`;
        }
        
        // Create new prompt override in agent data
        if (!this.currentAgent.agent) this.currentAgent.agent = {};
        if (!this.currentAgent.agent['prompt-overrides']) this.currentAgent.agent['prompt-overrides'] = {};
        
        // Save current tab content before adding new tab
        this.saveCurrentTabContent();
        
        // Add the new tab to the data model
        this.currentAgent.agent['prompt-overrides'][tabId] = '';
        
        // Re-render all tabs, selecting the new one
        this.renderPromptTabs(this.currentAgent.agent['prompt-overrides'], tabId);
        
        // Start renaming the new tab (after a short delay to ensure rendering)
        setTimeout(() => {
            this.startRenamingTab(tabId);
        }, 10);
    }
    
    startRenamingTab(tabId) {
        const tab = this.tabsList.querySelector(`.agent-tab[data-tab-id="${tabId}"]`);
        if (!tab) return;
        
        const nameSpan = tab.querySelector('.agent-tab-name');
        if (!nameSpan) return;
        
        const currentName = nameSpan.textContent;
        
        // Replace with editable input
        nameSpan.innerHTML = `<input type="text" class="tab-name-input" value="${currentName}">`;
        const input = nameSpan.querySelector('input');
        
        // Focus and select all text
        input.focus();
        input.select();
        
        // Handle input blur (lose focus)
        input.addEventListener('blur', () => {
            this.finishRenamingTab(tabId, input.value);
        });
        
        // Handle Enter key press
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                input.blur(); // Save on Enter
            }
        });
        
        // Handle Escape key press
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // Cancel editing, restore original name
                nameSpan.innerHTML = currentName;
            }
        });
    }
    
    finishRenamingTab(oldTabId, newTabId) {
        const trimmedNewTabId = newTabId.trim();
        const overrides = this.currentAgent?.agent?.['prompt-overrides'] || {};
        
        // Handle empty or unchanged names
        if (!trimmedNewTabId || oldTabId === trimmedNewTabId) {
            this.renderPromptTabs(overrides, oldTabId);
            return;
        }
        
        // Check for duplicate
        if (overrides.hasOwnProperty(trimmedNewTabId)) {
            alert('A prompt with this name already exists');
            this.renderPromptTabs(overrides, oldTabId);
            return;
        }
        
        // If we're renaming the current tab, make sure currentTabId is updated
        if (oldTabId === this.currentTabId) {
            this.currentTabId = trimmedNewTabId;
        }
        
        // Update the tab ID in agent data
        const content = overrides[oldTabId];
        delete overrides[oldTabId];
        overrides[trimmedNewTabId] = content;
        
        // Re-render tabs and select the renamed tab
        this.renderPromptTabs(overrides, trimmedNewTabId);
    }
    
    async deleteTab(tabId) {
        // Use the custom confirmation modal
        const confirmed = await showConfirmationModal({
            title: 'Delete Prompt Override',
            message: 'Are you sure you want to delete this prompt override?',
            itemName: tabId,
            confirmText: 'Delete',
            confirmVariant: 'danger',
            cancelText: 'Cancel'
        });
        
        if (!confirmed) {
            return;
        }
        
        const overrides = this.currentAgent?.agent?.['prompt-overrides'];
        if (!overrides || !overrides.hasOwnProperty(tabId)) {
            console.warn(`Attempted to delete non-existent tab: ${tabId}`);
            return;
        }
        
        // Find the index of the tab being deleted
        const tabIds = Object.keys(overrides);
        const deletedTabIndex = tabIds.indexOf(tabId);
        
        // Determine next tab to select
        let nextTabToSelect = null;
        
        // If we're deleting the currently selected tab, clear editor state
        if (tabId === this.currentTabId) {
            this.currentTabId = null; // Prevent saving content of deleted tab
            if (this.promptEditor) {
                const textEditor = this.promptEditor.getTextEditor();
                if (textEditor) {
                    textEditor.setValue('');
                }
            }
        }
        
        // Remove tab from agent data
        delete overrides[tabId];
        
        // Find next tab to select
        const remainingTabIds = Object.keys(overrides);
        if (remainingTabIds.length > 0) {
            // Try to select the previous tab, or the first tab if deleting the first one
            const newIndex = Math.max(0, deletedTabIndex - 1);
            if (newIndex < remainingTabIds.length) {
                nextTabToSelect = remainingTabIds[newIndex];
            } else {
                nextTabToSelect = remainingTabIds[0];
            }
        }
        
        // Update UI with the determined tab to select
        this.renderPromptTabs(overrides, nextTabToSelect);
    }
    
    getSelectedTools() {
        const checkboxes = this.toolsContainer.querySelectorAll('.tool-checkbox:checked');
        const selectedTools = Array.from(checkboxes).map(checkbox => checkbox.dataset.tool);
        return selectedTools;
    }
    
    saveAgentData(showFeedback = false) {
        // Save current tab content before saving agent data
        this.saveCurrentTabContent();
        
        // Create agent data object
        const agentData = {
            name: this.nameInput.value,
            description: this.descriptionInput.value,
            agent: {
                name: this.nameInput.value,
                description: this.descriptionInput.value,
                llms: {
                    main: {
                        provider: this.mainProviderSelect.value,
                        model: this.mainModelInput.value
                    },
                    expert: {
                        provider: this.expertProviderSelect.value,
                        model: this.expertModelInput.value
                    },
                    aux: {
                        provider: this.auxProviderSelect.value,
                        model: this.auxModelInput.value
                    }
                },
                tool_list: this.getSelectedTools(),
                'prompt-overrides': this.currentAgent?.agent?.['prompt-overrides'] || {}
            }
        };
        
        // Save agent data to the server
        fetch(`/api/agents/${this.currentAgentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(agentData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to update agent');
            }
            return response.json();
        })
        .then(updatedAgent => {
            console.log('Agent updated successfully:', updatedAgent);
            
            // Show notification if requested (from keyboard shortcut)
            if (showFeedback) {
                showNotification('Agent saved successfully', 'check_circle', 'success');
            }
            
            // Refresh the agents list in the main UI
            if (window.agentsManager) {
                window.agentsManager.loadAgents();
            }
        })
        .catch(error => {
            console.error('Error updating agent:', error);
            
            // Show error notification instead of alert
            if (showFeedback) {
                showNotification('Failed to save agent', 'error', 'error');
            } else {
                alert('Failed to update agent');
            }
        });
    }
}

// Initialize the agent modal when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create the agent modal instance
    window.agentModal = new AgentModal();
    console.log('Agent modal initialized');
});

// Export for module usage
export default AgentModal;