// src/ui/chat.js
// Purpose: Manage the chat message display and the message input form.

import { appState } from '../state.js';
import { emitChatMessage } from '../socket.js'; // Only need the emitter
import { emitJoinSession } from '../socket.js'; 
import { setStatus } from './status.js';       // To update status on send
import { showThinkingWidget } from './toolLog.js'; // Import to show thinking widget
import { showConfirmationModal } from '../utils.js'; // Import the confirmation dialog
import * as api from '../api.js'; // For clearSessionMessages
import { clearLogs as clearToolLogs } from './toolLog.js'; // For clearing tool logs

// Assume 'marked' and 'Prism' are loaded globally or via other means.
// If using modules: import { marked } from 'marked'; import Prism from 'prismjs';

// DOM Elements specific to chat
const messagesContainer = document.getElementById('messages');
const messageForm = document.getElementById('message-form');
const promptEditorContainer = document.getElementById('prompt-editor-container');
const sendButton = document.getElementById('send-button');
const projectNameElement = document.getElementById('project-name');
const sessionNameElement = document.getElementById('session-name');
const clearChatButton = document.getElementById('clear-chat-button');
const stopButton = document.getElementById('stop-button');
const attachmentButton = document.getElementById('attachment-button');
const fileInput = document.getElementById('file-input');
const attachedFilename = document.getElementById('attached-filename');
const taskTracker = document.getElementById('tracker');

// Variable to store pending image data and the prompt editor instance
let pendingImageDataUrl = null;
let promptEditor = null;

/**
 * Initializes the chat form listeners (submit, Cmd+Enter) and chat header functionality.
 */
export function initChatForm() {
    if (!messageForm || !promptEditorContainer || !sendButton) {
        console.warn("Chat form elements not found, skipping initialization.");
        return;
    }

    // Initialize prompt editor
    if (typeof promptEditorBoot === 'function') {
        promptEditor = promptEditorBoot(promptEditorContainer, {
            placeholder: "Ask me to help with a coding task..."
        });
        console.log("Prompt editor initialized");
    } else {
        console.error("promptEditorBoot function not found - prompt editor will not work");
    }

    messageForm.addEventListener('submit', handleFormSubmit);

    // Add key handlers to capture Cmd+Enter in the prompt editor
    document.addEventListener('keydown', function(event) {
        // Only handle Cmd+Enter, not just Enter
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            
            // Make sure we're not in block rename mode
            const blockNameInput = document.querySelector('.block-name-input:focus');
            if (blockNameInput) {
                return; // Exit if we're editing a block name
            }
            
            if (appState.currentAgentState.status === 'idle') {
                messageForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
        }
    });

    // Initialize attachment button functionality
    if (attachmentButton && fileInput) {
        attachmentButton.addEventListener('click', () => {
            fileInput.click(); // Trigger the hidden file input when attachment button is clicked
        });
        
        fileInput.addEventListener('change', handleFileSelection);
    } else {
        console.warn("Attachment button or file input elements not found.");
    }

    // Initialize chat header with project and session info
    updateChatHeader();

    // Add clear chat functionality
    if (clearChatButton) {
        clearChatButton.addEventListener('click', async () => {
            // Get the current session name for the confirmation message
            const sessionName = appState.currentSession?.name || 'current session';
            
            const confirmed = await showConfirmationModal({
                title: 'Clear Session Messages',
                message: `Are you sure you want to clear all messages from session "${sessionName}"?`,
                itemName: 'This action cannot be undone.',
                confirmText: 'Clear Messages',
                confirmVariant: 'warning',
            });
            
            if (confirmed) {
                const sessionId = appState.currentSessionId;
                if (!sessionId) {
                    console.error('No current session ID found for clearing');
                    return;
                }
                
                try {
                    setStatus('thinking', `Clearing session ${sessionName}...`);
                    const preserveTasks = taskTracker && taskTracker.pinned;
                    await api.clearSessionMessages(sessionId, { preserveTasks });
                    
                    console.log(`Reloading current session ${sessionId} after clear.`);
                    setStatus('connecting', 'Reloading session...');
                    enableChatInput(false);
                    clearMessages();
                    clearToolLogs();
                    
                    if (appState.socket?.connected) {
                        emitJoinSession(appState.socket, appState.currentProjectId, sessionId);
                    } else {
                        console.warn("Cannot reload cleared session: Socket not connected.");
                        alert("Session cleared, but couldn't automatically reload. Please switch sessions or refresh.");
                    }
                    
                    setStatus('idle');
                } catch (error) {
                    console.error('Error clearing session:', error);
                    alert(`Error clearing session: ${error.message}`);
                    setStatus('error', 'Clear failed');
                }
            } else {
                console.log("Session clear cancelled by user.");
            }
        });
    }
    
    // Add stop button functionality
    if (stopButton) {
        stopButton.addEventListener('click', () => {
            console.log('Stop button clicked, interrupting session');

            // Provide visual feedback - disable button and show spinner
            stopButton.disabled = true;
            stopButton.classList.add('stopping');
            const originalContent = stopButton.innerHTML;
            stopButton.innerHTML = '<span class="material-icons spin">sync</span>';

            if (appState.socket?.connected && appState.currentSessionId) {
                appState.socket.emit('interrupt_session', { sessionId: appState.currentSessionId });

                // If no response comes in 5 seconds, reset the button anyway
                setTimeout(() => {
                    if (stopButton.disabled) {
                        stopButton.disabled = false;
                        stopButton.classList.remove('stopping');
                        stopButton.innerHTML = originalContent;
                    }
                }, 5000);
            } else {
                console.error("Cannot interrupt session: Socket not connected or no active session.");
                // Reset the button immediately if we can't even send the request
                stopButton.disabled = false;
                stopButton.classList.remove('stopping');
                stopButton.innerHTML = originalContent;
            }
        });
    }

    console.log("Chat form initialized.");
}

/**
 * Handles the message form submission.
 * @param {Event} event - The submit event.
 */
function handleFormSubmit(event) {
    event.preventDefault();
    
    // Get message text from prompt editor
    let messageText = '';
    if (promptEditor) {
        // Check which tab is active
        const activeTab = document.querySelector('.prompt-editor-container .tab.active');
        if (activeTab && activeTab.dataset.tab === 'text') {
            // Get text from the plain text editor
            const textarea = document.querySelector('.prompt-editor-container .raw-textarea');
            if (textarea) {
                messageText = textarea.value.trim();
            }
        } else {
            // Get text from blocks editor - access the blockEditor property which has getPTJson method
            if (promptEditor && promptEditor.blockEditor && typeof promptEditor.blockEditor.getPTJson === 'function') {
                const json = promptEditor.blockEditor.getPTJson();
                if (json && json.blocks) {
                    // Get text from all non-muted blocks
                    messageText = json.blocks
                        .filter(block => !block.muted)
                        .map(block => block.content)
                        .join('\n\n')
                        .trim();
                }
            } else {
                console.warn("Block editor not properly initialized or getPTJson not available");
            }
        }
    }

    // Check if agent is responding using currentAgentState instead of isAgentResponding flag
    if ((messageText || pendingImageDataUrl) && appState.currentAgentState.status === 'idle') {
        // Build content
        let contentToSend;
        if (pendingImageDataUrl) {
            contentToSend = [
                { type: 'text', text: messageText || '' },
                { type: 'image_url', image_url: { url: pendingImageDataUrl } }
            ];
        } else {
            contentToSend = messageText;
        }

        sendMessage(contentToSend);
        
        // Clear the prompt editor using the dedicated method
        if (promptEditor && promptEditor.clearContent) {
            promptEditor.clearContent();
        }
        
        // Reset attachment state
        pendingImageDataUrl = null;
        fileInput.value = '';
        if (attachmentButton) {
            attachmentButton.classList.remove('attached');
        }
        if (attachedFilename) {
            attachedFilename.textContent = '';
        }
    } else if (appState.currentAgentState.status !== 'idle') {
        console.log("Agent is busy, message not sent.");
        // Optionally provide visual feedback that agent is busy
    }
}

// handleInputKeydown function has been replaced by document-level event listener

/**
 * Processes and sends a user message.
 * @param {string|Array} content - The message content, either text or array with text and image.
 */
export function sendMessage(content) {
    // If content is an array (text + image), display just the text part in UI
    const displayContent = Array.isArray(content) 
        ? content.find(item => item.type === 'text')?.text || 'Sent image' 
        : content;
    
    addUserMessage(displayContent); // Display user message immediately

    setStatus('thinking'); // Update status indicator
    showThinkingWidget('Thinking', Date.now()); // Show thinking widget immediately

    // Send message via WebSocket
    if (appState.socket) {
        emitChatMessage(appState.socket, content);
    } else {
        console.error("Cannot send message: Socket not available.");
        addAgentMessage("⚠️ Error: Could not connect to the server to send message.");
        setStatus('error', 'Connection Error');
    }
}

/**
 * Adds a user message div to the chat container.
 * @param {string|object} message - The message content or message object.
 */
export function addUserMessage(message) {
    if (!messagesContainer) return;
    
    // Check if the message is a tool result that should not be displayed
    if (typeof message === 'object' && message.content) {
        // Skip tool result messages
        if (typeof message.content === 'string' && message.content.startsWith('```TOOL_RESULT')) {
            console.log('Skipping tool result message in UI');
            return;
        }
        message = message.content; // Extract content if message is an object
    }
    
    // Skip if the content still looks like a tool result (double check)
    if (typeof message === 'string' && message.startsWith('```TOOL_RESULT')) {
        console.log('Skipping tool result message in UI');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user-message';

    const avatarIcon = document.createElement('div');
    avatarIcon.className = 'message-avatar';
    avatarIcon.innerHTML = '<span class="material-icons">person</span>';
    messageDiv.appendChild(avatarIcon);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';
    
    // Replace newlines with <br> tags to preserve line breaks without using white-space: pre-wrap
    if (typeof message === 'string') {
        // Use innerHTML safely after escaping the content and converting \n to <br>
        const escapedContent = message
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\n/g, '<br>');
        messageContent.innerHTML = escapedContent;
    } else {
        messageContent.textContent = message;
    }
    
    messageDiv.appendChild(messageContent);

    messagesContainer.appendChild(messageDiv);
    addNewMessageAnimation(messageDiv); // Add animation
    scrollToBottom();
}

/**
 * Adds an agent message div to the chat container, processing markdown and code blocks.
 * @param {string|object} message - The raw content from the agent or message object.
 */
export function addAgentMessage(message) {
    if (!messagesContainer || typeof marked === 'undefined' || typeof Prism === 'undefined') {
        console.warn("Cannot add agent message: Container, marked, or Prism not available.");
        // Fallback: display raw content if markdown/prism not ready
        if(messagesContainer) {
            const fallbackDiv = document.createElement('div');
            fallbackDiv.className = 'message agent-message';
            fallbackDiv.textContent = `(Agent - Raw): ${typeof message === 'object' ? JSON.stringify(message) : message}`;
            messagesContainer.appendChild(fallbackDiv);
            scrollToBottom();
        }
        return;
    }
    
    // Skip tool use messages (content is an array instead of string)
    if (typeof message === 'object') {
        if (Array.isArray(message.content) && message.content.length > 0 && message.content[0].type === 'tool_use') {
            console.log('Skipping tool use message in UI');
            return;
        }
        // Extract content if message is an object and content is a string
        if (typeof message.content === 'string') {
            message = message.content;
        }
    }
    
    // If after extraction we still have an object, it's not a text message we want to display
    if (typeof message !== 'string') {
        console.log('Skipping non-string message in UI:', message);
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent-message';

    const avatarIcon = document.createElement('div');
    avatarIcon.className = 'message-avatar';
    avatarIcon.innerHTML = '<span class="material-icons">smart_toy</span>';
    messageDiv.appendChild(avatarIcon);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    // --- Content Processing ---
    let processedContent = message;

    // 1. Handle potential custom widgets (like filetree) before markdown
    if (window.fileTreeWidget && message.includes('```filetree')) {
        processedContent = window.fileTreeWidget.preprocessContent(message);
    }

    // 2. Parse Markdown
    // Use 'sanitize: true' if Marked version supports it or use DOMPurify after parsing
    messageContent.innerHTML = marked.parse(processedContent /*, { sanitize: true } */);
    // If not using built-in sanitize:
    // messageContent.innerHTML = DOMPurify.sanitize(marked.parse(processedContent));
    
    // Modify all links to open in new window/tab
    messageContent.querySelectorAll('a').forEach(link => {
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer'); // Security best practice
    });

    // 3. Handle custom widget post-processing (if any)
    if (window.fileTreeWidget && message.includes('```filetree')) {
        window.fileTreeWidget.postprocessContent(messageContent);
    }

    // 4. Process Code Blocks for Syntax Highlighting and Copy Button
    // Only add these features to code blocks in the main chat area (#messages)
    // This is to avoid affecting other areas like context modal
    if (messageContent.closest('#messages')) {
        messageContent.querySelectorAll('pre code').forEach((codeBlock) => {
            const pre = codeBlock.parentNode;
            if (pre.tagName !== 'PRE') return; // Ensure it's a direct child of <pre>
    
            // Add language class (basic detection if needed, Prism relies on class)
            const languageClass = codeBlock.className || '';
            if (languageClass) {
                pre.classList.add(languageClass); // Prism often styles the <pre>
                // Extract language from class name and set data-lang attribute
                const langMatch = languageClass.match(/language-(\w+)/);
                if (langMatch && langMatch[1]) {
                    pre.setAttribute('data-lang', langMatch[1]);
                }
            } else {
                // Add a default if none found - helps Prism identify it as code
                pre.classList.add('language-none'); // Or 'language-plain' etc.
                codeBlock.classList.add('language-none');
                pre.setAttribute('data-lang', 'text');
            }
    
            // Add line numbers class if Prism line-numbers plugin is used
            pre.classList.add('line-numbers');
    
            // Add copy button
            const copyButtonContainer = document.createElement('div');
            copyButtonContainer.className = 'copy-button-container'; // Style container
    
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.innerHTML = '<span class="material-icons">content_copy</span>';
            copyButton.setAttribute('aria-label', 'Copy code');
            copyButton.title = 'Copy code'; // Tooltip text
    
            const tooltip = document.createElement('span');
            tooltip.className = 'copy-tooltip';
            tooltip.textContent = 'Copied!';
            copyButtonContainer.appendChild(copyButton);
            copyButtonContainer.appendChild(tooltip);


            copyButton.addEventListener('click', () => {
                navigator.clipboard.writeText(codeBlock.textContent)
                    .then(() => {
                        copyButton.innerHTML = '<span class="material-icons">check</span>'; // Show checkmark
                        copyButton.classList.add('copied');
                        tooltip.classList.add('visible'); // Show tooltip

                        // Reset after a delay
                        setTimeout(() => {
                            copyButton.innerHTML = '<span class="material-icons">content_copy</span>';
                            copyButton.classList.remove('copied');
                            tooltip.classList.remove('visible');
                        }, 1500);
                    })
                    .catch(err => {
                        console.error('Failed to copy code:', err);
                        tooltip.textContent = 'Error';
                        tooltip.classList.add('visible', 'error');
                        setTimeout(() => {
                            tooltip.classList.remove('visible', 'error');
                            tooltip.textContent = 'Copied!'; // Reset text
                        }, 1500);
                    });
            });

            pre.appendChild(copyButtonContainer); // Append the container
        });
    }
    // --- End Content Processing ---

    messageDiv.appendChild(messageContent);
    messagesContainer.appendChild(messageDiv);

    // Trigger Prism highlighting *after* appending and adding copy buttons
    try {
        Prism.highlightAllUnder(messageContent);
    } catch (e){}
    
    // Apply data-lang attributes after Prism has processed the code blocks
    messageContent.querySelectorAll('pre[class*="language-"]').forEach((pre) => {
        if (!pre.hasAttribute('data-lang')) {
            const languageClass = Array.from(pre.classList).find(cls => cls.startsWith('language-'));
            if (languageClass) {
                const lang = languageClass.replace('language-', '');
                pre.setAttribute('data-lang', lang);
            }
        }
    });

    addNewMessageAnimation(messageDiv); // Add animation
    scrollToBottom();
}

/**
 * Scrolls the messages container to the bottom, optionally forcing it.
 * @param {boolean} [force=false] - If true, scrolls even if user isn't near the bottom.
 */
export function scrollToBottom(force = false) {
    if (!messagesContainer) return;

    const tolerance = 120; // Pixels - how close to bottom user needs to be for auto-scroll
    const userNearBottom = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < tolerance;

    if (force || userNearBottom) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth' // Use smooth scrolling
        });
    }
}

/**
 * Clears all messages from the chat display.
 */
export function clearMessages() {
    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        console.log("Chat messages cleared.");
    }
}

/**
 * Updates the chat header with project and session names.
 * Can be called externally when project/session changes.
 */
export function updateChatHeader() {
    if (projectNameElement && sessionNameElement && appState.currentProject) {
        projectNameElement.textContent = appState.currentProject.name || 'Project';
        sessionNameElement.textContent = appState.currentSession?.name || 'Session';
    }
}

/**
 * Adds a temporary animation class to a new message.
 * @param {HTMLElement} messageElement - The message element to animate.
 */
function addNewMessageAnimation(messageElement) {
    messageElement.classList.add('new-message');
    // Remove the class after the animation duration (match CSS)
    setTimeout(() => {
        messageElement.classList.remove('new-message');
    }, 300); // Duration should match CSS transition/animation
}

/**
 * Handles the selection of files from the file input.
 * @param {Event} event - The change event from the file input.
 */
function handleFileSelection(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Only accept image files
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        fileInput.value = '';
        return;
    }

    // Update UI to show uploading state
    if (attachmentButton) {
        attachmentButton.classList.add('uploading');
    }

    // Show the filename in the toolbar with uploading indicator
    if (attachedFilename) {
        attachedFilename.textContent = `${file.name} (uploading...)`;
    }

    // Create FormData and upload via fetch instead of socket
    const formData = new FormData();
    formData.append('image', file);

    fetch('/api/upload/image', {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        // Store the image URL instead of base64 data
        pendingImageDataUrl = data.imageUrl;
        console.log(`File ${file.name} uploaded successfully. URL: ${pendingImageDataUrl}`);

        // Update UI to show attached state
        if (attachmentButton) {
            attachmentButton.classList.remove('uploading');
            attachmentButton.classList.add('attached');
        }

        // Update filename display
        if (attachedFilename) {
            attachedFilename.textContent = file.name;
        }
    })
    .catch(error => {
        console.error('Upload failed:', error);
        alert('Upload failed. Please try again with a smaller image.');

        // Reset UI
        fileInput.value = '';
        if (attachmentButton) {
            attachmentButton.classList.remove('uploading');
            attachmentButton.classList.remove('attached');
        }
        if (attachedFilename) {
            attachedFilename.textContent = '';
        }
        pendingImageDataUrl = null;
    });
}

/**
 * Formats a file size in bytes to a human-readable string.
 * @param {number} bytes - The file size in bytes.
 * @returns {string} A human-readable file size string.
 */
function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Enables or disables the chat input field and send button.
 * Also controls the visibility of the stop button.
 * @param {boolean} enable - True to enable, false to disable.
 */
export function enableChatInput(enable) {
    // Always disable the send button when appropriate
    if (sendButton) {
        sendButton.disabled = !enable;
    }
    if (stopButton) {
        stopButton.style.display = enable ? 'none' : 'inline-flex';
    }

    // Add/remove disabled class to prompt container for visual indication only
    // Input remains interactive but send button stays disabled
    const promptContainer = document.querySelector('.prompt-container');
    if (promptContainer) {
        promptContainer.classList.toggle('disabled', !enable);
    }

    // Keep form enabled to allow typing even when agent is thinking
    // Just add visual indication that agent is busy
    messageForm?.classList.toggle('disabled', !enable);
}

// Add history changed event listener when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add listener for history-changed event to reload chat content
    window.addEventListener('history-changed', (event) => {
        console.log('History changed event received, reloading chat content');
        if (event.detail?.sessionId === appState.currentSessionId) {
            // Reload the conversation history through socket
            if (appState.socket && appState.socket.connected) {
                // Clear current messages and show loading state
                clearMessages();
                setStatus('connecting', 'Reloading conversation...');

                // Request session rejoin to get updated history
                appState.socket.emit('join_session', {
                    projectId: appState.currentProjectId,
                    sessionId: appState.currentSessionId,
                    reloadOnly: true  // Flag to indicate just reloading history, not full join
                });
            }
        }
    });
});