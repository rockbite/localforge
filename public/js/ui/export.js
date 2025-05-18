// Export functionality for settings dialog
class ExportUI {
    constructor(settingsUI) {
        this.settingsUI = settingsUI;
        this.exportTab = document.getElementById('export-tab');
        
        if (!this.exportTab) {
            console.error('Export tab element not found');
            return;
        }
        
        // Lists
        this.agentsExportList = this.exportTab.querySelector('.agents-export-list');
        this.mcpsExportList = this.exportTab.querySelector('.mcps-export-list');
        this.projectsExportList = this.exportTab.querySelector('.projects-export-list');
        
        // Buttons
        this.selectAllBtn = this.exportTab.querySelector('.select-all-btn');
        this.unselectAllBtn = this.exportTab.querySelector('.unselect-all-btn');
        this.exportBtn = this.exportTab.querySelector('.export-btn');
        
        this.setupEventListeners();

        // Listen for data updates from other UI components
        window.addEventListener('agents-updated', () => {
            // Re-populate only the agents list to avoid flicker on others
            this.populateAgentsList();
        });

        // Re-populate MCP list once settings finish loading
        window.addEventListener('mcp-updated', () => {
            this.populateMcpsList();
        });
    }
    
    setupEventListeners() {
        // Select/unselect all buttons
        if (this.selectAllBtn) {
            this.selectAllBtn.addEventListener('click', () => this.toggleAllCheckboxes(true));
        }
        
        if (this.unselectAllBtn) {
            this.unselectAllBtn.addEventListener('click', () => this.toggleAllCheckboxes(false));
        }
        
        // Export button
        if (this.exportBtn) {
            this.exportBtn.addEventListener('click', () => this.handleExport());
        }
    }
    
    toggleAllCheckboxes(checked) {
        if (!this.exportTab) return;
        
        const checkboxes = this.exportTab.querySelectorAll('.export-item-checkbox input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
        
        // If no checkboxes, it might be because the lists haven't been populated yet
        if (checkboxes.length === 0) {
            this.populateExportLists();
            // Try again after populating
            setTimeout(() => {
                const newCheckboxes = this.exportTab.querySelectorAll('.export-item-checkbox input[type="checkbox"]');
                newCheckboxes.forEach(checkbox => {
                    checkbox.checked = checked;
                });
            }, 100);
        }
    }
    
    handleExport() {
        // Get all selected items
        const selectedAgents = Array.from(this.agentsExportList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.name);
        
        const selectedMcps = Array.from(this.mcpsExportList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.name);
        
        const selectedProjects = Array.from(this.projectsExportList.querySelectorAll('input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.name);
        
        // Create export data object
        const exportData = {
            agents: selectedAgents,
            mcps: selectedMcps,
            projects: selectedProjects
        };
        
        // For now we're just showing the file save dialog without actual content
        this.showFileSaveDialog();
    }
    
    showFileSaveDialog() {
        // Use the Electron API if available, otherwise use the web File System Access API
        if (window.electronAPI && typeof window.electronAPI.showSaveDialog === 'function') {
            window.electronAPI.showSaveDialog({
                title: 'Export Localforge Data',
                defaultPath: 'localforge-export.lte',
                filters: [
                    { name: 'Localforge Template Export', extensions: ['lte'] }
                ]
            }).then(result => {
                if (!result.canceled && result.filePath) {
                    // In a real implementation, we would save the file here
                    console.log('File would be saved to:', result.filePath);
                    this.showExportSuccess();
                }
            });
        } else {
            // Web browser file save
            this.webFileSave();
        }
    }
    
    webFileSave() {
        // Use the File System Access API if available
        if ('showSaveFilePicker' in window) {
            const opts = {
                suggestedName: 'localforge-export.lte',
                types: [{
                    description: 'Localforge Template Export',
                    accept: { 'application/octet-stream': ['.lte'] }
                }]
            };
            
            window.showSaveFilePicker(opts)
                .then(fileHandle => {
                    // In a real implementation, we would write to the file here
                    console.log('File handle obtained for saving');
                    this.showExportSuccess();
                })
                .catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error('Error saving file:', err);
                    }
                });
        } else {
            // Fallback for browsers without File System Access API
            // This just creates a empty download as a placeholder
            const blob = new Blob([''], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'localforge-export.lte';
            a.click();
            URL.revokeObjectURL(url);
            this.showExportSuccess();
        }
    }
    
    showExportSuccess() {
        if (typeof showNotification === 'function') {
            showNotification('Export successful', 'check_circle', 'success');
        } else {
            console.log('Export successful');
        }
    }
    
    fetchMcpServersDirectly() {
        console.log('Fetching MCP servers directly from API');
        fetch('/api/settings')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load settings: ${response.statusText}`);
                }
                return response.json();
            })
            .then(settings => {
                console.log('Settings loaded from API:', settings);
                let mcpServers = [];
                
                if (settings.mcpServers && typeof settings.mcpServers === 'string') {
                    try {
                        mcpServers = JSON.parse(settings.mcpServers);
                        console.log('Parsed MCP servers:', mcpServers);
                    } catch (e) {
                        console.error('Error parsing MCP servers:', e);
                    }
                }
                
                if (!mcpServers || mcpServers.length === 0) {
                    this.mcpsExportList.innerHTML = '<div class="export-list-empty">No MCP servers available</div>';
                    return;
                }
                
                // Create a list item for each MCP server
                mcpServers.forEach(server => {
                    const item = document.createElement('div');
                    item.className = 'export-item';
                    
                    const checkboxContainer = document.createElement('div');
                    checkboxContainer.className = 'export-item-checkbox checkbox-container';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.dataset.name = server.alias;
                    
                    const customCheckbox = document.createElement('span');
                    customCheckbox.className = 'custom-checkbox';
                    
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(customCheckbox);
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'export-item-name';
                    nameSpan.textContent = server.alias;
                    
                    item.appendChild(checkboxContainer);
                    item.appendChild(nameSpan);
                    
                    this.mcpsExportList.appendChild(item);
                });
            })
            .catch(error => {
                console.error('Error loading MCP servers:', error);
                this.mcpsExportList.innerHTML = '<div class="export-list-empty">Error loading MCP servers</div>';
            });
    }
    
    fetchAgentsDirectly() {
        console.log('Fetching agents directly from API');
        fetch('/api/agents')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load agents: ${response.statusText}`);
                }
                return response.json();
            })
            .then(agents => {
                console.log('Agents loaded directly from API:', agents);
                if (!agents || agents.length === 0) {
                    this.agentsExportList.innerHTML = '<div class="export-list-empty">No agents available</div>';
                    return;
                }
                
                // Create a list item for each agent
                agents.forEach(agent => {
                    const item = document.createElement('div');
                    item.className = 'export-item';
                    
                    const checkboxContainer = document.createElement('div');
                    checkboxContainer.className = 'export-item-checkbox checkbox-container';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.dataset.name = agent.name;
                    checkbox.dataset.id = agent.id;
                    
                    const customCheckbox = document.createElement('span');
                    customCheckbox.className = 'custom-checkbox';
                    
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(customCheckbox);
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'export-item-name';
                    nameSpan.textContent = agent.name;
                    
                    item.appendChild(checkboxContainer);
                    item.appendChild(nameSpan);
                    
                    this.agentsExportList.appendChild(item);
                });
            })
            .catch(error => {
                console.error('Error loading agents directly:', error);
                this.agentsExportList.innerHTML = '<div class="export-list-empty">Error loading agents</div>';
            });
    }
    
    populateExportLists(retryCount = 0) {
        console.log('Populating export lists');
        this.populateAgentsList();
        this.populateMcpsList();
        this.populateProjectsList();

        // If everything still empty, retry after short delay (max 3 retries)
        if (retryCount < 3) {
            const listsEmpty = (
                this.agentsExportList?.children.length === 0 &&
                this.mcpsExportList?.children.length === 0 &&
                this.projectsExportList?.children.length === 0
            );
            if (listsEmpty) {
                setTimeout(() => this.populateExportLists(retryCount + 1), 400);
            }
        }
    }
    
    populateAgentsList() {
        if (!this.agentsExportList) {
            console.error('Agents export list element not found');
            return;
        }
        
        this.agentsExportList.innerHTML = '';
        
        // Get agents from the global agents manager
        let agents = [];
        if (window.agentsManager && window.agentsManager.agents) {
            agents = window.agentsManager.agents;
            console.log('Found agents in window.agentsManager:', agents);
        } else {
            console.log('No agentsManager found, trying settingsUI');
            
            // Try to get from settingsUI as fallback
            if (this.settingsUI.agentsUI && this.settingsUI.agentsUI.agents) {
                agents = this.settingsUI.agentsUI.agents;
                console.log('Found agents in settingsUI:', agents);
            } else {
                console.log('No agents found in settingsUI');
                
                // As a last resort, fetch agents directly from API
                this.fetchAgentsDirectly();
                return;
            }
        }
        
        if (agents.length === 0) {
            console.log('Agents array empty, fetching from API as fallback');
            this.fetchAgentsDirectly();
            return;
        }
        
        // Create a list item for each agent
        agents.forEach(agent => {
            const item = document.createElement('div');
            item.className = 'export-item';
            
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'export-item-checkbox checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.name = agent.name;
            
            const customCheckbox = document.createElement('span');
            customCheckbox.className = 'custom-checkbox';
            
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(customCheckbox);
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'export-item-name';
            nameSpan.textContent = agent.name;
            
            item.appendChild(checkboxContainer);
            item.appendChild(nameSpan);
            
            this.agentsExportList.appendChild(item);
        });
    }
    
    populateMcpsList() {
        if (!this.mcpsExportList) {
            console.error('MCPs export list element not found');
            return;
        }
        
        this.mcpsExportList.innerHTML = '';
        
        // Get MCP servers from the settings UI if available
        let mcpServers = [];
        if (this.settingsUI.mcpServers) {
            mcpServers = this.settingsUI.mcpServers;
            console.log('Found MCP servers in settingsUI:', mcpServers);
        } else {
            console.log('No MCP servers found in settingsUI');
            
            // Try to fetch MCP servers from API
            this.fetchMcpServersDirectly();
            return;
        }
        
        if (mcpServers.length === 0) {
            console.log('No MCP servers available to display');
            this.mcpsExportList.innerHTML = '<div class="export-list-empty">No MCP servers available</div>';
            return;
        }
        
        // Create a list item for each MCP server
        mcpServers.forEach(server => {
            const item = document.createElement('div');
            item.className = 'export-item';
            
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'export-item-checkbox checkbox-container';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.dataset.name = server.alias;
            
            const customCheckbox = document.createElement('span');
            customCheckbox.className = 'custom-checkbox';
            
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(customCheckbox);
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'export-item-name';
            nameSpan.textContent = server.alias;
            
            item.appendChild(checkboxContainer);
            item.appendChild(nameSpan);
            
            this.mcpsExportList.appendChild(item);
        });
    }
    
    populateProjectsList() {
        if (!this.projectsExportList) {
            console.error('Projects export list element not found');
            return;
        }
        
        this.projectsExportList.innerHTML = '';
        console.log('Fetching projects from API...');
        
        // Fetch projects from the API
        fetch('/api/projects')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load projects: ${response.statusText}`);
                }
                console.log('Projects API response received');
                return response.json();
            })
            .then(data => {
                const projects = Array.isArray(data) ? data : (data.projects || []);
                console.log('Projects loaded:', projects);
                if (!projects || projects.length === 0) {
                    console.log('No projects available to display');
                    this.projectsExportList.innerHTML = '<div class="export-list-empty">No projects available</div>';
                    return;
                }
                
                // Create a list item for each project
                projects.forEach(project => {
                    const item = document.createElement('div');
                    item.className = 'export-item';
                    
                    const checkboxContainer = document.createElement('div');
                    checkboxContainer.className = 'export-item-checkbox checkbox-container';
                    
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.dataset.name = project.name;
                    checkbox.dataset.id = project.id;
                    
                    const customCheckbox = document.createElement('span');
                    customCheckbox.className = 'custom-checkbox';
                    
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(customCheckbox);
                    
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'export-item-name';
                    nameSpan.textContent = project.name;
                    
                    item.appendChild(checkboxContainer);
                    item.appendChild(nameSpan);
                    
                    this.projectsExportList.appendChild(item);
                });
            })
            .catch(error => {
                console.error('Error loading projects:', error);
                this.projectsExportList.innerHTML = '<div class="export-list-empty">Error loading projects</div>';
            });
    }
}

// Add the export functionality to the SettingsUI
SettingsUI.prototype.initExportTab = function() {
    // Fix for agents.js expecting closeModal method
    if (!this.closeModal && this.closeDialog) {
        this.closeModal = this.closeDialog;
    }
    
    this.exportUI = new ExportUI(this);
};

// Update the openTab method to populate the export lists when the export tab is opened
const originalOpenTab = SettingsUI.prototype.openTab;
SettingsUI.prototype.openTab = function(tabId) {
    originalOpenTab.call(this, tabId);

    if (tabId === 'export' && this.exportUI) {
        // Short delay to ensure other async loaders finished
        setTimeout(() => {
            this.exportUI.populateExportLists();
        }, 50);
    }
};

// Initialize the export tab when SettingsUI is created
document.addEventListener('DOMContentLoaded', function() {
    // Wait for SettingsUI to be initialized
    const checkSettingsUI = setInterval(function() {
        if (window.settingsUI) {
            console.log('SettingsUI found, initializing ExportTab');
            
            // Make sure agentsManager is initialized
            if (!window.agentsManager) {
                console.log('AgentsManager not found, might be loading still');
            } else {
                console.log('AgentsManager found with', window.agentsManager.agents?.length || 0, 'agents');
            }
            
            window.settingsUI.initExportTab();
            clearInterval(checkSettingsUI);
        }
    }, 100);
});