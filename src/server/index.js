import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import * as agentLogic from '../services/agent/index.js';
import { callLLM } from '../services/llm/index.js';
import { MAIN_MODEL, AUX_MODEL } from '../config/llm.js';
import { setWorkingDirectory, createToolRegistry, getAllToolNames } from '../../tools/index.js';
import { 
    projectSessionManager, 
    sessionTaskEvents, 
    sessionAccountingEvents,
    sessionToolLogEvents,
    sessionAgentStateEvents
} from '../services/sessions/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3001;

// Map sessionId -> Set of sockets interested in this session
const sessionSocketMap = new Map();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../../public')));

import store from '../db/store.js';

// ------------------------------------------------------------------
// REST API routes
// ------------------------------------------------------------------

// Import the routers and mount them
(async () => {
    const settingsRoutes = await import('../routes/settingsRoutes.js');
    app.use('/api/settings', settingsRoutes.default);

    // Register settings change callbacks for various components that need to refresh
    const { refreshOpenAIClient } = await import('../middleware/openai.js');
    const { refreshLLMSettings } = await import('../config/llm.js');
    
    // Register callbacks to refresh dependent components when settings change
    settingsRoutes.registerSettingsChangeCallback((changes) => {
        console.log('Settings changed:', Object.keys(changes).join(', '));
        
        // Refresh OpenAI client if API key changed
        if (changes.openaiApiKey !== undefined) {
            refreshOpenAIClient();
        }
        
        // Refresh LLM settings if model settings changed
        if (changes.mainModelName !== undefined || 
            changes.mainModelProvider !== undefined) {
            refreshLLMSettings();
        }
    });

    const { routerProjects, routerSessions } = await import('../routes/projectsRoutes.js');

    /** @type {import('express').Router} */
    app.use('/api/projects', routerProjects);

    /** @type {import('express').Router} */
    app.use('/api/sessions', routerSessions);
})();

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));

// Main chat endpoint
app.post('/agent/chat', async (req, res) => {
    try {
        const { projectId, sessionId, message, stream } = req.body;
        
        // Validate required parameters
        if (!projectId || !sessionId) {
            return res.status(400).json({ error: 'ProjectId and sessionId are required.' });
        }
        
        if (!message || !message.content) {
            return res.status(400).json({ error: 'Message content is required.' });
        }
        
        // If streaming is requested, set up appropriate headers
        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            
            // Set up a timeout handler to close the connection if needed
            const connectionTimeout = setTimeout(() => {
                console.log('Streaming timeout reached');
                res.write('event: close\ndata: {"reason": "timeout"}\n\n');
                res.end();
            }, 600000); // 10 minute timeout
            
            // Handle unexpected client disconnection
            res.on('close', () => {
                console.log('Client disconnected before response completion');
                clearTimeout(connectionTimeout);
            });
            
            // Create a callback for streaming updates from the agent
            const streamCallback = (update) => {
                try {
                    res.write(`event: update\ndata: ${JSON.stringify(update)}\n\n`);
                } catch (error) {
                    console.error('Error writing stream update:', error);
                }
            };
            
            // Start streaming
            res.write('event: start\ndata: {"status": "processing"}\n\n');
            
            // Process the request with streaming
            try {
                const agentResponse = await agentLogic.handleRequest(
                    projectId,
                    sessionId,
                    message,
                    streamCallback
                );
                
                // Send the final response
                res.write(`event: complete\ndata: ${JSON.stringify(agentResponse)}\n\n`);
                res.write('event: close\ndata: {"reason": "complete"}\n\n');
                res.end();
                clearTimeout(connectionTimeout);
            } catch (error) {
                console.error('Error in streaming agent processing:', error);
                res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
                res.write('event: close\ndata: {"reason": "error"}\n\n');
                res.end();
                clearTimeout(connectionTimeout);
            }
        } else {
            // Non-streaming request
            const agentResponse = await agentLogic.handleRequest(
                projectId,
                sessionId,
                message
            );
            
            res.json(agentResponse);
        }
    } catch (error) {
        console.error('Error processing agent request:', error);
        res.status(500).json({ error: 'Internal server error processing request.' });
    }
});

// Auxiliary endpoints for special functions

// Topic detection endpoint for UI
app.post('/agent/detect-topic', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'Message content is required.' });
        }
        
        const messages = [
            {
                role: 'system',
                content: `Analyze if this message indicates a new conversation topic. If it does, extract a 2-3 word title that captures the new topic. Format your response as a JSON object with two fields: 'isNewTopic' (boolean) and 'title' (string, or null if isNewTopic is false). Only include these fields, no other text.`
            },
            {
                role: 'user',
                content: message
            }
        ];
        
        const response = await callLLM({
            modelName: AUX_MODEL,
            messages,
            temperature: 0,
            max_tokens: 128,
            stream: false
        });
        
        try {
            const result = JSON.parse(response.content);
            return res.json(result);
        } catch (error) {
            return res.json({ isNewTopic: false, title: null });
        }
    } catch (error) {
        console.error('Error detecting topic:', error);
        res.status(500).json({ error: 'Error detecting topic.' });
    }
});

// Whimsical gerund generation for UI status indicators
app.post('/agent/generate-gerund', async (req, res) => {
    try {
        const { word } = req.body;
        
        if (!word) {
            return res.status(400).json({ error: 'Word is required.' });
        }
        
        const messages = [
            {
                role: 'system',
                content: `Analyze this message and come up with a single verb in gerund form that's related to the word. Only include the word with no other text or punctuation. The word should have the first letter capitalized. Add some whimsy and surprise to entertain the user. Synonyms are welcome, including obscure words. NEVER use a destructive word, such as Terminating, Killing, Deleting, Destroying, Stopping, Exiting, or similar.`
            },
            {
                role: 'user',
                content: word
            }
        ];
        
        const response = await callLLM({
            modelName: AUX_MODEL,
            messages,
            temperature: 1.0,
            max_tokens: 32,
            stream: false
        });
        
        return res.json({ gerund: response.content.trim() });
    } catch (error) {
        console.error('Error generating gerund:', error);
        res.status(500).json({ error: 'Error generating gerund.' });
    }
});

// Socket.IO connections
io.on('connection', (socket) => {
    console.log(`New client connected: ${socket.id}`);
    
    // Initialize socket user data
    socket.userData = {
        currentSessionId: null,
        currentProjectId: null
    };
    
    // Send current model configuration to client
    socket.emit('model_info', { mainModel: MAIN_MODEL, auxModel: AUX_MODEL });
    
    // Handle session joining
    socket.on('join_session', async ({ sessionId, projectId }) => {
        try {
            // Validate session exists
            await projectSessionManager.getSession(sessionId);
            
            // Leave previous session if any
            if (socket.userData.currentSessionId && sessionSocketMap.has(socket.userData.currentSessionId)) {
                const currentSessionSockets = sessionSocketMap.get(socket.userData.currentSessionId);
                currentSessionSockets.delete(socket);
                
                if (currentSessionSockets.size === 0) {
                    sessionSocketMap.delete(socket.userData.currentSessionId);
                }
            }
            
            // Join new session
            socket.userData.currentSessionId = sessionId;
            socket.userData.currentProjectId = projectId;
            
            if (!sessionSocketMap.has(sessionId)) {
                sessionSocketMap.set(sessionId, new Set());
            }
            sessionSocketMap.get(sessionId).add(socket);
            
            console.log(`Socket ${socket.id} joined session ${sessionId}`);
            
            // Send initial state for the joined session
            const sessionData = await projectSessionManager.getSession(sessionId);
            
            // Check if this is a reconnect during active processing
            const isProcessing = sessionData.agentState && 
                (sessionData.agentState.status === 'thinking' || sessionData.agentState.status === 'tool_running');
            
            // Add a flag to indicate if this is an active processing reconnect
            socket.userData.reconnectedDuringProcessing = isProcessing;
            
            if (isProcessing) {
                console.log(`Socket ${socket.id} reconnected during active processing for session ${sessionId}`);
            }
            
            socket.emit('session_joined', {
                sessionId,
                projectId,
                history: sessionData.history || [],
                tasks: sessionData.tasks || [],
                accounting: sessionData.accounting || { models: {}, totalUSD: 0 },
                workingDirectory: sessionData.workingDirectory,
                toolLogs: sessionData.toolLogs || [],
                agentState: sessionData.agentState || { 
                    status: 'idle', 
                    statusText: null, 
                    startTime: null, 
                    activeToolCallId: null 
                },
                reconnectedDuringProcessing: isProcessing
            });
            
            // Emit initial tasks if needed by UI components
            const tasks = await projectSessionManager.getTasks(sessionId);
            socket.emit('tasks_initial_list', tasks);
            
            // Emit initial accounting if available
            if (sessionData.accounting && sessionData.accounting.totalUSD > 0) {
                socket.emit('cost_update', {
                    sessionId: sessionId,
                    totalUSD: sessionData.accounting.totalUSD.toFixed(4),
                    breakdown: sessionData.accounting.models
                });
            }
        } catch (error) {
            console.error(`Failed joining session ${sessionId} for socket ${socket.id}:`, error);
            socket.emit('session_join_error', { sessionId, error: error.message });
        }
    });
    
    // Handle workspace setup
    socket.on('setup_workspace', async (data) => {
        try {
            const { directory } = data;
            const sessionId = socket.userData.currentSessionId;
            
            if (!sessionId) {
                socket.emit('setup_error', { message: 'No active session joined.' });
                return;
            }
            
            if (directory === undefined || directory === null) {
                // Allow null/undefined directory
                await projectSessionManager.setWorkingDirectory(sessionId, null);
                setWorkingDirectory(null);
                
                // Send current tasks list to initialize the widget
                const tasks = await projectSessionManager.getTasks(sessionId);
                socket.emit('tasks_initial_list', tasks);
                
                // Confirm to client
                socket.emit('setup_confirmed', { directory: null });
                return;
            }
            
            // If directory is provided, validate it exists
            if (directory) {
                try {
                    const stats = await fs.promises.stat(directory);
                    if (!stats.isDirectory()) {
                        socket.emit('setup_error', { message: 'Not a valid directory' });
                        return;
                    }
                } catch (error) {
                    console.error(`Error accessing directory: ${directory}`, error);
                    socket.emit('setup_error', { message: `Cannot access directory: ${error.message}` });
                    return;
                }
            }
            
            // Store the working directory in the session and set it for tools
            await projectSessionManager.setWorkingDirectory(sessionId, directory);
            const setResult = setWorkingDirectory(directory);
            if (!setResult) {
                socket.emit('setup_error', { message: 'Failed to set working directory for tools' });
                return;
            }
            
            console.log(`Set working directory for session ${sessionId}: ${directory}`);
            
            // Send current tasks list to initialize the widget
            const tasks = await projectSessionManager.getTasks(sessionId);
            socket.emit('tasks_initial_list', tasks);
            
            // Confirm to client
            socket.emit('setup_confirmed', { directory });
            
        } catch (error) {
            console.error('Error setting up workspace:', error);
            socket.emit('setup_error', { message: 'Failed to setup workspace' });
        }
    });
    
    // Handle chat messages from client
    socket.on('chat_message', async (messageData) => {
        try {
            const { content } = messageData;
            const sessionId = socket.userData.currentSessionId;
            const projectId = socket.userData.currentProjectId;
            
            if (!sessionId || !projectId) {
                socket.emit('error', { message: 'No active session joined. Cannot send message.' });
                return;
            }
            
            // check if we have API key set in settings
            const apiKey = store.getSetting('openaiApiKey');
            if(apiKey === undefined || apiKey === null || apiKey === '') {
                socket.emit('error', { message: 'API_KEY_MISSING' });
                return;
            }
            
            if (!content) {
                socket.emit('error', { message: 'Message content is required' });
                return;
            }
            
            // Send acknowledgment to client
            socket.emit('message_received', { status: 'processing' });
            
            // Extract first word from text portion for gerund generation
            let firstWord = 'Processing';
            if (Array.isArray(content)) {
                const textPart = content.find(p => p.type === 'text');
                if (textPart && textPart.text) {
                    firstWord = textPart.text.trim().split(/\s+/)[0] || firstWord;
                }
            } else if (typeof content === 'string') {
                firstWord = content.trim().split(/\s+/)[0] || firstWord;
            }
            
            try {
                const messages = [
                    {
                        role: 'system',
                        content: `Analyze this message and come up with a single verb in gerund form that's related to the word. Only include the word with no other text or punctuation. The word should have the first letter capitalized. Add some whimsy and surprise to entertain the user. Synonyms are welcome, including obscure words. NEVER use a destructive word, such as Terminating, Killing, Deleting, Destroying, Stopping, Exiting, or similar.`
                    },
                    {
                        role: 'user',
                        content: firstWord
                    }
                ];
                
                const gerundResponse = await callLLM({
                    modelName: AUX_MODEL,
                    messages,
                    temperature: 1.0,
                    max_tokens: 32,
                    stream: false
                });
                
                socket.emit('agent_update', {
                    type: 'gerund_generation',
                    gerund: gerundResponse.content.trim()
                });
            } catch (error) {
                console.error('Error generating gerund:', error);
                // Continue even if gerund generation fails
            }
            
            // Prepare the message object for the agent
            const message = {
                role: 'user',
                content: content
            };
            
            // IMMEDIATELY persist the user message before starting agent processing
            console.log(`[${sessionId}] Persisting user message immediately.`);
            await projectSessionManager.appendUserMessageOnly(sessionId, message);
            
            // Stream callback to send updates to the client
            const streamCallback = (update) => {
                socket.emit('agent_update', update);
            };
            
            // Process the message with the agent (now happens *after* user message is saved)
            const agentResponse = await agentLogic.handleRequest(
                projectId,
                sessionId,
                message,
                streamCallback
            );
            
            // Check if the response indicates an interruption occurred
            if (agentResponse?.interrupted) {
                console.log(`[${sessionId}] handleRequest completed with interruption.`);
                const socketsInSession = sessionSocketMap.get(sessionId);
                if (socketsInSession) {
                    socketsInSession.forEach(clientSocket => {
                        clientSocket.emit('interrupt_complete', { sessionId });
                    });
                }
                // No final 'agent_response' needed if interrupted, history updated separately
            } else {
                // BROADCAST the final response to all sockets currently in the session room
                const socketsInSession = sessionSocketMap.get(sessionId);
                if (socketsInSession && socketsInSession.size > 0) {
                    console.log(`[${sessionId}] Broadcasting agent_response to ${socketsInSession.size} socket(s).`);
                    // Include the sessionId in the payload for the client-side check
                    const responsePayload = {
                        ...agentResponse,
                        sessionId: sessionId
                    };
                    socketsInSession.forEach(clientSocket => {
                        // Emit to each connected client in the session
                        clientSocket.emit('agent_response', responsePayload);
                    });
                } else {
                    console.log(`[${sessionId}] No active sockets found to send agent_response.`);
                    // The response is saved, will appear on next load if session still exists.
                }
            }
            
        } catch (error) {
            console.error('Error processing chat message:', error);
            // Check if the error itself is due to interruption
            if (error.message === 'ABORT_ERR' || error.name === 'AbortError') { 
                console.log(`[${sessionId}] Chat message processing aborted.`);
                const socketsInSession = sessionSocketMap.get(sessionId);
                if (socketsInSession) {
                    socketsInSession.forEach(clientSocket => {
                        clientSocket.emit('interrupt_complete', { sessionId });
                    });
                }
            } else {
                // Handle other errors
                socket.emit('error', { 
                    message: 'Error processing your message',
                    sessionId: socket.userData.currentSessionId 
                });
            }
        }
    });
    
    // Handle request for initial task list
    socket.on('get_initial_tasks', async () => {
        if (socket.userData && socket.userData.currentSessionId) {
            try {
                const tasks = await projectSessionManager.getTasks(socket.userData.currentSessionId);
                socket.emit('tasks_initial_list', tasks);
            } catch (error) {
                console.error(`Error getting initial tasks:`, error);
            }
        }
    });
    
    // Handle interruption requests
    socket.on('interrupt_session', async () => {
        const sessionId = socket.userData?.currentSessionId;
        if (!sessionId) {
            console.warn(`Socket ${socket.id} tried to interrupt without an active session.`);
            socket.emit('interrupt_error', { message: 'No active session to interrupt.' });
            return;
        }

        console.log(`[${sessionId}] Received interrupt request from socket ${socket.id}`);
        const success = projectSessionManager.requestInterruption(sessionId);

        if (success) {
            // Acknowledge the request was received and flag set
            socket.emit('interrupt_acknowledged', { sessionId });
        } else {
            // This implies the session wasn't active in the manager's cache
            socket.emit('interrupt_error', { 
                sessionId, 
                message: 'Session not found or not active on the server.' 
            });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        const sessionId = socket.userData?.currentSessionId;
        if (sessionId && sessionSocketMap.has(sessionId)) {
            const sessionSockets = sessionSocketMap.get(sessionId);
            sessionSockets.delete(socket);
            
            if (sessionSockets.size === 0) {
                console.log(`Session ${sessionId} has no more connected sockets.`);
                sessionSocketMap.delete(sessionId);
                // No need to explicitly unload - the ProjectSessionManager will do it when inactive
            }
        }
    });
});

// Main entry point - now a single page that handles everything
app.get('/', (req, res) => {
    res.render('main');
});

// Start the server only if not already running
const startServer = () => {
    try {
        server.listen(port, () => {
            console.log(`Agent backend server listening on port ${port}`);
        });
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${port} is already in use. Server may already be running.`);
        } else {
            console.error(`Error starting server: ${error.message}`);
        }
    }
};

// Check if this file is being run directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
    startServer();
}

// Export for use in other modules
export { app, server, startServer };

// Listen for task events from ProjectSessionManager and forward to clients
sessionTaskEvents.on('task_diff_update', ({ sessionId, type, task, taskId }) => {
    const sockets = sessionSocketMap.get(sessionId);
    if (sockets) {
        console.log(`Broadcasting task update (${type}) for session ${sessionId} to ${sockets.size} sockets.`);
        sockets.forEach(socket => {
            socket.emit('task_diff_update', { sessionId, type, task, taskId });
        });
    }
});

// Listen for accounting updates and forward to clients
sessionAccountingEvents.on('updated', (data) => {
    const sockets = sessionSocketMap.get(data.sessionId);
    if (sockets) {
        console.log(`Broadcasting cost update for session ${data.sessionId} to ${sockets.size} sockets.`);
        sockets.forEach(socket => {
            // data already contains sessionId so no need to add it
            socket.emit('cost_update', data);
        });
    }
});

// Listen for tool log appends and forward to clients
sessionToolLogEvents.on('append', ({ sessionId, logEntry }) => {
    const sockets = sessionSocketMap.get(sessionId);
    if (sockets) {
        console.log(`Broadcasting tool log append for session ${sessionId} to ${sockets.size} sockets.`);
        sockets.forEach(socket => {
            socket.emit('tool_log_append', { sessionId, logEntry });
        });
    }
});

// Listen for agent state updates and forward to clients
sessionAgentStateEvents.on('update', ({ sessionId, agentState }) => {
    const sockets = sessionSocketMap.get(sessionId);
    if (sockets) {
        sockets.forEach(socket => {
            socket.emit('agent_state_update', { sessionId, agentState });
        });
    }
});