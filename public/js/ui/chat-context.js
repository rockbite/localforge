// src/ui/chat-context.js
// Purpose: Manage the chat context view modal for displaying the complete LLM context

import { appState } from '../state.js';
import * as api from '../api.js';

// DOM Elements specific to context modal
const contextModal = document.getElementById('chat-context-modal');
const contextClose = document.getElementById('context-close');
const contextMessages = document.getElementById('context-messages');
const showContextButton = document.getElementById('show-context-button');

/**
 * Initializes the chat context view modal and button listeners
 */
export function initChatContextView() {
    if (!contextModal || !contextClose || !contextMessages || !showContextButton) {
        console.warn("Chat context view elements not found, skipping initialization.");
        return;
    }

    // Add event listener to the Show Context button
    showContextButton.addEventListener('click', async () => {
        await showChatContext();
    });

    // Add event listener to close button
    contextClose.addEventListener('click', () => {
        contextModal.classList.remove('active');
    });

    console.log("Chat context view initialized.");
}

/**
 * Shows the chat context modal with the current session's full context
 */
async function showChatContext() {
    const sessionId = appState.currentSessionId;
    if (!sessionId) {
        console.error('No current session ID found for viewing context');
        return;
    }

    try {
        // Clear previous content
        contextMessages.innerHTML = '';
        
        // Show the modal with loading indicator
        contextModal.classList.add('active');
        contextMessages.innerHTML = '<div class="context-loading">Loading full context data...</div>';
        
        // Fetch session data with the full context info including tool logs
        const sessionData = await api.getFullSessionContext(sessionId);
        
        if (!sessionData) {
            contextMessages.innerHTML = '<div class="context-error">Failed to load session data</div>';
            return;
        }
        
        console.log("Loaded full context data:", sessionData);
        
        // Pass the full context data to the renderer
        renderFullContext(sessionData.fullContext);
    } catch (error) {
        console.error('Error showing chat context:', error);
        contextMessages.innerHTML = `<div class="context-error">Error loading context: ${error.message}</div>`;
    }
}

/**
 * Renders the full context from session data
 * @param {Object} sessionData - The complete session data object
 */
function renderFullContext(contextData) {
    // Clear the container
    contextMessages.innerHTML = '';
    
    // Add a header explaining what this view shows
    const systemExplanation = document.createElement('div');
    systemExplanation.className = 'context-explanation';
    systemExplanation.innerHTML = '<p>This view shows the exact message format sent to the LLM API, including system instructions and conversation history.</p>';
    contextMessages.appendChild(systemExplanation);
    
    // Add messages container
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'context-messages-list';
    contextMessages.appendChild(messagesContainer);
    
    // First, add the system message
    if (contextData.systemPromptSummary) {
        const systemMessage = createContextMessageElement(
            'system', 
            'System Message (First message sent to LLM)', 
            'Includes prompts, environment, directory structure, and git status',
            contextData.systemPromptSummary.content
        );
        messagesContainer.appendChild(systemMessage);
    }
    
    // Then add all the history messages
    if (contextData.messages && contextData.messages.length > 0) {
        // Note about conversation history
        const historySeparator = document.createElement('div');
        historySeparator.className = 'context-separator';
        historySeparator.innerHTML = '<h3>Conversation History</h3><p>Messages are shown in the exact order they are sent to the LLM API</p>';
        messagesContainer.appendChild(historySeparator);
        
        // Add numbered messages
        contextData.messages.forEach((message, index) => {
            let content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2);
            
            // Format the role for display
            let title = `${index + 1}. ${message.role.charAt(0).toUpperCase() + message.role.slice(1)}`; // Add index numbering
            
            // Handle tool calls in assistant messages
            if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
                content += '\n\nTool Calls:\n' + JSON.stringify(message.tool_calls, null, 2);
                title += ' with Tool Calls';
            }
            
            // For tool messages, add the tool call ID if available
            let subtitle = '';
            if (message.role === 'tool' && message.tool_call_id) {
                subtitle = `Tool Call ID: ${message.tool_call_id}`;
            }
            
            const messageElement = createContextMessageElement(message.role, title, subtitle, content);
            messagesContainer.appendChild(messageElement);
        });
    } else {
        messagesContainer.innerHTML += '<div class="context-empty-state">No message history found</div>';
    }

    // Scroll to the top after loading content
    contextMessages.scrollTop = 0;
}

/**
 * Creates a context message element for display
 * @param {string} type - Message type (system, user, assistant, tool)
 * @param {string} title - Message title
 * @param {string} subtitle - Optional subtitle or description
 * @param {string} content - Message content
 * @returns {HTMLElement} - The created message element
 */
function createContextMessageElement(type, title, subtitle = '', content = '') {
    const messageElement = document.createElement('div');
    messageElement.className = `context-message ${type}`;
    
    const headerElement = document.createElement('div');
    headerElement.className = 'context-message-header';
    
    const titleElement = document.createElement('div');
    titleElement.className = 'context-message-type';
    titleElement.textContent = title;
    headerElement.appendChild(titleElement);
    
    if (subtitle) {
        const subtitleElement = document.createElement('div');
        subtitleElement.className = 'context-message-subtitle';
        subtitleElement.textContent = subtitle;
        headerElement.appendChild(subtitleElement);
    }
    
    messageElement.appendChild(headerElement);
    
    const contentElement = document.createElement('pre'); // Using pre element to preserve whitespace
    contentElement.className = 'context-message-content';
    contentElement.textContent = content; // Use textContent to preserve formatting and prevent HTML injection
    messageElement.appendChild(contentElement);
    
    return messageElement;
}
