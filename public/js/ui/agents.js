// Agents functionality for settings dialog
// Module that extends the settings UI functionality with agent management

class AgentsManager {
    constructor(settingsUI) {
        this.settingsUI = settingsUI;
        
        // Get UI elements
        this.agentsList = document.querySelector('.agents-list');
        this.emptyAgentsState = document.querySelector('.empty-agents-state');
        this.addAgentButtons = document.querySelectorAll('.add-agent-btn');
        
        // Agent delete modal elements
        this.agentDeleteModal = document.getElementById('agent-delete-modal');
        this.agentDeleteName = document.getElementById('agent-delete-name');
        this.agentDeleteCancel = document.getElementById('agent-delete-cancel');
        this.agentDeleteConfirm = document.getElementById('agent-delete-confirm');
        
        // Initialize
        this.agents = [];
        this.initEventListeners();
        this.loadAgents();
    }
    
    initEventListeners() {
        // Add event listeners for add agent buttons
        this.addAgentButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.addNewAgent();
            });
        });
        
        // Delete modal event listeners
        if (this.agentDeleteCancel) {
            this.agentDeleteCancel.addEventListener('click', () => {
                this.closeAgentDeleteModal();
            });
        }
    }
    
    loadAgents() {
        fetch('/api/agents')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load agents: ${response.statusText}`);
                }
                return response.json();
            })
            .then(agents => {
                if (!Array.isArray(agents)) {
                    console.error('Expected agents to be an array but got:', typeof agents);
                    agents = [];
                }
                
                this.agents = agents;
                this.renderAgentsList();
                // Notify other components data is ready
                window.dispatchEvent(new CustomEvent('agents-updated'));
            })
            .catch(error => {
                console.error('Error loading agents:', error);
                this.agents = [];
                this.renderAgentsList();
            });
    }
    
    renderAgentsList() {
        if (!this.agentsList || !this.emptyAgentsState) return;
        
        // Show/hide empty state based on agents count
        if (this.agents.length === 0) {
            this.agentsList.style.display = 'none';
            this.emptyAgentsState.style.display = 'flex';
            return;
        } else {
            this.agentsList.style.display = 'block';
            this.emptyAgentsState.style.display = 'none';
        }
        
        // Clear current list
        this.agentsList.innerHTML = '';
        
        // Add each agent to the list
        this.agents.forEach((agent) => {
            const agentItem = document.createElement('div');
            agentItem.className = 'agent-item';
            agentItem.dataset.id = agent.id;
            
            // Get description from either agent.description or agent.agent.description
            const description = agent.description || (agent.agent && agent.agent.description) || '';
            
            agentItem.innerHTML = `
                <div class="agent-name" data-id="${agent.id}">${agent.name}</div>
                <div class="agent-description">${description}</div>
                <div class="agent-actions">
                    <button class="mini-button edit-agent" title="Edit"><span class="material-icons">edit</span></button>
                    <button class="mini-button delete-agent" title="Delete"><span class="material-icons">delete</span></button>
                </div>
            `;
            
            this.agentsList.appendChild(agentItem);
        });
        
        // Add event listeners for agent actions
        this.setupAgentEventListeners();
    }
    
    setupAgentEventListeners() {
        // Edit button clicks
        const editButtons = this.agentsList.querySelectorAll('.edit-agent');
        editButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const agentItem = button.closest('.agent-item');
                const agentId = agentItem.dataset.id;
                
                // Close settings modal
                if (this.settingsUI && this.settingsUI.closeModal) {
                    this.settingsUI.closeModal();
                }
                
                // Open agent modal
                if (window.agentModal) {
                    window.agentModal.openModal(agentId);
                }
            });
        });
        
        // Delete button clicks
        const deleteButtons = this.agentsList.querySelectorAll('.delete-agent');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const agentItem = button.closest('.agent-item');
                const agentId = agentItem.dataset.id;
                this.showAgentDeleteConfirmation(agentId);
            });
        });
        
        // Double-click on agent name for inline editing
        const agentNames = this.agentsList.querySelectorAll('.agent-name');
        agentNames.forEach(nameElement => {
            nameElement.addEventListener('dblclick', (e) => {
                const agentItem = nameElement.closest('.agent-item');
                const agentId = agentItem.dataset.id;
                this.makeAgentNameEditable(agentItem, agentId);
            });
        });
    }
    
    makeAgentNameEditable(agentItem, agentId) {
        const nameElement = agentItem.querySelector('.agent-name');
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;
        
        const currentName = agent.name;
        
        // Store original content to restore if needed
        const originalContent = nameElement.innerHTML;
        
        // Calculate the width of the current text
        const textWidth = this.getTextWidth(currentName, getComputedStyle(nameElement).font);
        
        // Calculate total width based on text + padding (10px for left/right padding total)
        const totalWidth = textWidth + 10;
        
        // Replace with editable input that preserves styling with exactly the same width
        nameElement.innerHTML = `<input type="text" class="settings-agent-name-input" value="${currentName}" style="width: ${totalWidth}px;">`;
        const input = nameElement.querySelector('input');
        
        // Focus and select all text
        input.focus();
        input.select();
        
        // Handle input blur (lose focus)
        input.addEventListener('blur', () => {
            this.saveAgentName(agentId, input.value);
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
                // Cancel editing, restore original content
                nameElement.innerHTML = originalContent;
            }
        });
    }
    
    // Helper method to calculate text width
    getTextWidth(text, font) {
        // Create a hidden canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        
        // Set the font
        context.font = font;
        
        // Measure text
        const metrics = context.measureText(text);
        
        return metrics.width;
    }
    
    saveAgentName(agentId, newName) {
        if (!newName || newName.trim() === '') {
            // If empty, revert to original name
            this.renderAgentsList();
            return;
        }
        
        const agent = this.agents.find(a => a.id === agentId);
        if (!agent) return;
        
        const oldName = agent.name;
        if (newName === oldName) {
            // No change, just rerender
            this.renderAgentsList();
            return;
        }
        
        // Check for duplicate names
        if (this.agents.some(a => a.name === newName && a.id !== agentId)) {
            alert('An agent with this name already exists');
            this.renderAgentsList();
            return;
        }
        
        // Update on server
        fetch(`/api/agents/${agentId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to update agent name');
            }
            return response.json();
        })
        .then(updatedAgent => {
            // Update local data and rerender
            const index = this.agents.findIndex(a => a.id === agentId);
            if (index !== -1) {
                this.agents[index] = updatedAgent;
            }
            this.renderAgentsList();
            
            // Dispatch event to notify other components that agents have changed
            window.dispatchEvent(new CustomEvent('agents-updated'));
        })
        .catch(error => {
            console.error('Error updating agent name:', error);
            alert('Failed to update agent name');
            this.renderAgentsList();
        });
    }
    
    addNewAgent() {
        const defaultName = 'New Agent';
        let newName = defaultName;
        let counter = 1;
        
        // Find a unique default name if necessary
        while (this.agents.some(agent => agent.name === newName)) {
            newName = `${defaultName} ${counter++}`;
        }
        
        // Create the new agent on the server
        fetch('/api/agents', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: newName })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to create new agent');
            }
            return response.json();
        })
        .then(newAgent => {
            // Add to local array and rerender
            this.agents.push(newAgent);
            this.renderAgentsList();
            
            // Dispatch event to notify other components that agents have changed
            window.dispatchEvent(new CustomEvent('agents-updated'));
            
            // Find the new agent item and make it editable
            setTimeout(() => {
                const newAgentItem = this.agentsList.querySelector(`[data-id="${newAgent.id}"]`);
                if (newAgentItem) {
                    this.makeAgentNameEditable(newAgentItem, newAgent.id);
                }
            }, 0);
        })
        .catch(error => {
            console.error('Error creating new agent:', error);
            alert('Failed to create new agent');
        });
    }
    
    showAgentDeleteConfirmation(agentId) {
        if (!this.agentDeleteModal || !this.agentDeleteName || !this.agentDeleteConfirm) return;
        
        const agentToDelete = this.agents.find(agent => agent.id === agentId);
        if (!agentToDelete) {
            console.error(`Agent with ID ${agentId} not found`);
            return;
        }
        
        this.agentDeleteName.textContent = agentToDelete.name;
        this.currentAgentToDelete = agentId;
        
        // Show the modal
        this.agentDeleteModal.classList.add('active');
        
        // Set up confirm button handler
        this.agentDeleteConfirm.onclick = () => {
            this.deleteAgent(this.currentAgentToDelete);
        };
    }
    
    closeAgentDeleteModal() {
        if (!this.agentDeleteModal) return;
        
        this.agentDeleteModal.classList.remove('active');
        this.currentAgentToDelete = null;
        
        // Clean up event listener
        if (this.agentDeleteConfirm) {
            this.agentDeleteConfirm.onclick = null;
        }
    }
    
    deleteAgent(agentId) {
        if (agentId === null || agentId === undefined) return;
        
        console.log(`Deleting agent with ID: ${agentId}`);
        
        // Delete from server
        fetch(`/api/agents/${agentId}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('Failed to delete agent');
            }
            return response.json();
        })
        .then(data => {
            console.log('Delete successful, removing from UI');
            // Remove from local array and rerender
            const index = this.agents.findIndex(agent => agent.id === agentId);
            if (index !== -1) {
                this.agents.splice(index, 1);
            }
            this.renderAgentsList();
            
            // Dispatch event to notify other components that agents have changed
            window.dispatchEvent(new CustomEvent('agents-updated'));
            
            // Close the modal
            this.closeAgentDeleteModal();
        })
        .catch(error => {
            console.error('Error deleting agent:', error);
            alert('Failed to delete agent');
            this.closeAgentDeleteModal();
        });
    }
}

// Initialize the agents manager when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize the manager when settings UI is initialized
    const initializeAgentsManager = () => {
        if (window.settingsUI) {
            // Create the agents manager
            window.agentsManager = new AgentsManager(window.settingsUI);
            console.log('Agents manager initialized');
        } else {
            // Try again after a short delay
            setTimeout(initializeAgentsManager, 50);
        }
    };
    
    // Start the initialization process
    initializeAgentsManager();
});