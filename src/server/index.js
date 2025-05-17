// server/index.js -
import fs from 'fs';
import path from 'path';
import os from 'os'; // Import the os module
import mcpService from '../services/mcp/index.js';

// Log directory in the user's home directory
const logDir = path.join(os.homedir(), '.localforge-logs'); // Using a hidden folder for logs


try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`Log directory created at: ${logDir}`);
    }
} catch (error) {
    console.error(`Error creating log directory ${logDir}:`, error);
    // Fallback or decide how to handle if log directory creation fails
}
const serverLogPath = path.join(logDir, 'server-crash.log');
console.log(`Server crash logs will be written to: ${serverLogPath}`); // Log the path for easy finding

process.on('uncaughtException', (error, origin) => {
    const errorMsg = `!!! SERVER UNCAUGHT EXCEPTION !!!\nTimestamp: ${new Date().toISOString()}\nOrigin: ${origin}\nError: ${error.stack || error}\n`;
    console.error(errorMsg);
    try {
        fs.appendFileSync(serverLogPath, errorMsg + '\n');
    } catch (e) {
        console.error('Failed to write to server crash log (uncaughtException):', e);
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    const errorMsg = `!!! SERVER UNHANDLED REJECTION !!!\nTimestamp: ${new Date().toISOString()}\nPromise: ${promise}\nReason: ${reason?.stack || reason}\n`;
    console.error(errorMsg);
    try {
        fs.appendFileSync(serverLogPath, errorMsg + '\n');
    } catch (e) {
        console.error('Failed to write to server crash log (unhandledRejection):', e);
    }
    // process.exit(1); // Optional: decide if unhandled rejections should also crash the server
});

// Redirect console.log and console.error to also go to a general server log file (optional but helpful)
const generalLogPath = path.join(logDir, 'server-general.log');

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

console.log = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
    originalConsoleLog.apply(console, args); // Keep logging to stdout
    try {
        fs.appendFileSync(generalLogPath, `${new Date().toISOString()} [LOG] ${message}\n`);
    } catch (e) {
        originalConsoleError('Failed to write to general server log (console.log):', e);
    }
};

console.error = (...args) => {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ');
    originalConsoleError.apply(console, args); // Keep logging to stderr
    try {
        fs.appendFileSync(generalLogPath, `${new Date().toISOString()} [ERROR] ${message}\n`);
        // Also log errors to the crash log if it's a significant one, or rely on uncaughtException
    } catch (e) {
        originalConsoleError('Failed to write to general server log (console.error):', e);
    }
};



import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import http from 'http';
import { Server } from 'socket.io';
import * as agentLogic from '../services/agent/index.js';
import { 
    projectSessionManager, 
    sessionTaskEvents, 
    sessionAccountingEvents,
    sessionToolLogEvents,
    sessionAgentStateEvents
} from '../services/sessions/index.js';
import * as updateService from '../services/updates/index.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express
const app = express();
const server = http.createServer(app);
// Set lower buffer size limit for Socket.IO to catch any future mistakes
// and force proper uploads through the REST API
const io = new Server(server, {
    maxHttpBufferSize: 2 * 1024 * 1024 // 2MB limit
});
// this is passed from electron app
const port = process.env.LOCALFORGE_PORT ? Number(process.env.LOCALFORGE_PORT) : 3826;


import fixPath from "fix-path";
fixPath(); // fix path for electron

// Map sessionId -> Set of sockets interested in this session
const sessionSocketMap = new Map();

// Middleware
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '../../public')));

import store from '../db/store.js';
import {AUX_MODEL, callLLMByType, EXPERT_MODEL, getModelNameByType, MAIN_MODEL} from "../middleware/llm.js";

// ------------------------------------------------------------------
// REST API routes
// ------------------------------------------------------------------

// Import the routers and mount them
(async () => {
    const settingsRoutes = await import('../routes/settingsRoutes.js');
    app.use('/api/settings', settingsRoutes.default);

    // Initialize update service
    updateService.initUpdateService();

    // Register callbacks to refresh dependent components when settings change
    settingsRoutes.registerSettingsChangeCallback((changes) => {
        console.log('Settings changed:', Object.keys(changes).join(', '));

        // If MCP servers were changed, sync the MCP service
        if (changes.mcpServers) {
            console.log('MCP servers changed, syncing MCP service...');
            mcpService.syncWithSettings().catch(error => {
                console.error('Error syncing MCP service with settings:', error);
            });
        }
    });

    const { routerProjects, routerSessions } = await import('../routes/projectsRoutes.js');

    /** @type {import('express').Router} */
    app.use('/api/projects', routerProjects);

    /** @type {import('express').Router} */
    app.use('/api/sessions', routerSessions);

    // Import and use agents routes
    const agentsRoutes = await import('../routes/agentsRoutes.js');
    app.use('/api/agents', agentsRoutes.default);

    // Import and use upload routes
    const uploadRoutes = await import('../routes/uploadRoutes.js');
    app.use('/api/upload', uploadRoutes.default);

    // Import and use compression routes
    const compressionRoutes = await import('../routes/compressionRoutes.js');
    app.use('/api/compression', compressionRoutes.default);
})();

// Set EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));

/*
// Main chat endpoint
@deprecated needs deleting
app.post('/agent/chat', async (req, res) => {
    try {
        //todo: is this even ever used?
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
});*/


// Auxiliary endpoints for special functions

// Updates endpoint
app.get('/api/updates', (req, res) => {
    try {
        const updateInfo = updateService.getUpdateInfo();
        res.json(updateInfo);
    } catch (error) {
        console.error('Error checking for updates:', error);
        res.status(500).json({ error: 'Failed to check for updates' });
    }
});

// Manual update check endpoint
app.post('/api/updates/check', async (req, res) => {
    try {
        const updateInfo = await updateService.checkForUpdates();
        
        // If an update is available, broadcast to all connected sockets
        if (updateInfo.updateAvailable) {
            io.emit('update_available', {
                current: updateInfo.currentVersion,
                latest: updateInfo.latestVersion
            });
        }
        
        res.json(updateInfo);
    } catch (error) {
        console.error('Error checking for updates:', error);
        res.status(500).json({ error: 'Failed to check for updates' });
    }
});

/*
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

        const response = await callLLMByType(AUX_MODEL, {
            messages,
            temperature: 0,
            max_tokens: 128
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
});*/

/*
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

        const response = await callLLMByType(AUX_MODEL, {
            messages,
            temperature: 1.0,
            max_tokens: 32
        });
        
        return res.json({ gerund: response.content.trim() });
    } catch (error) {
        console.error('Error generating gerund:', error);
        res.status(500).json({ error: 'Error generating gerund.' });
    }
});*/

function processMessageForUploadedImage(message) {

    for(let idx in message.content) {
        let content = message.content[idx];
        if(content.type === "image_url") {
            if(content.image_url.url.startsWith('/uploads/')) {
                let imageUrl = content.image_url.url;
                imageUrl = imageUrl.replace(/^\/uploads\//, '');
                const filePath = path.join(os.tmpdir(), 'localforge_uploads', imageUrl);
                const imageBuffer = fs.readFileSync(filePath);
                // Determine MIME type based on file extension
                const ext = path.extname(imageUrl).toLowerCase();
                let mimeType = 'image/png'; // Default to png

                // Set correct MIME type based on extension
                if (ext === '.jpg' || ext === '.jpeg') {
                    mimeType = 'image/jpeg';
                } else if (ext === '.gif') {
                    mimeType = 'image/gif';
                } else if (ext === '.webp') {
                    mimeType = 'image/webp';
                }
                // Convert to base64 data URI
                const base64Data = imageBuffer.toString('base64');
                let userImageData = `data:${mimeType};base64,${base64Data}`;
                message.content[idx].image_url.url = userImageData;
            }
        }
    }

    return message;
}

// Socket.IO connections
io.on('connection', (socket) => {
    
    // Initialize socket user data
    socket.userData = {
        currentSessionId: null,
        currentProjectId: null
    };
    
    // Send current model configuration to client
    // TODO: get model names by type using llm.js settings
    socket.emit('model_info',
        {
            expertModel: getModelNameByType(EXPERT_MODEL),
            mainModel: getModelNameByType(MAIN_MODEL),
            auxModel: getModelNameByType(AUX_MODEL)
        });
    
    // Send update information to client on connection
    const updateData = updateService.getUpdateInfo();
    if (updateData.updateAvailable) {
        socket.emit('update_available', {
            current: updateData.currentVersion,
            latest: updateData.latestVersion
        });
    }
    
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
                agentId: sessionData.agentId,
                mcpAlias: sessionData.mcpAlias,
                mcpUrl: sessionData.mcpUrl,
                toolLogs: sessionData.toolLogs || [],
                tasksPinned: sessionData.tasksPinned || false,
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

        const abortController = new AbortController();

        const { content } = messageData;
        const sessionId = socket.userData.currentSessionId;
        const projectId = socket.userData.currentProjectId;

        if (!sessionId || !projectId) {
            socket.emit('error', { message: 'No active session joined. Cannot send message.' });
            return;
        }

        if (!content) {
            socket.emit('error', { message: 'Message content is required' });
            return;
        }

        const signal = abortController.signal;
        const checkInterruption = () => {
            if (projectSessionManager.isInterruptionRequested(sessionId)) {
                console.log(`[${sessionId}] AbortController triggered by interruption flag.`);
                abortController.abort();
                // No need to constantly check after aborting
            } else {
                // Re-schedule check if not aborted yet
                setTimeout(checkInterruption, 250); // Check every 250ms
            }
        };
        // Start checking
        const checkIntervalId = setTimeout(checkInterruption, 250);

        try {
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

                const gerundResponse = await callLLMByType(AUX_MODEL, {
                    messages,
                    temperature: 1.0,
                    max_tokens: 32,
                    signal
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

            // handle images
            processMessageForUploadedImage(message);

            
            // IMMEDIATELY persist the user message before starting agent processing
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
                streamCallback,
                signal
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
        } finally {
            // Clean up the interruption check interval
            clearTimeout(checkIntervalId);
            // Ensure the interruption flag is cleared if handleRequest exits for any reason
            projectSessionManager.clearInterruption(sessionId);
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
    
    // Handle agent selection
    socket.on('set_agent', async (data) => {
        try {
            const { agentId } = data;
            const sessionId = socket.userData.currentSessionId;

            if (!sessionId) {
                console.warn('Attempted to set agent with no active session');
                return;
            }

            // Update the agent ID in the session
            await projectSessionManager.setAgentId(sessionId, agentId);

            console.log(`Set agent ID for session ${sessionId}: ${agentId || 'none'}`);

        } catch (error) {
            console.error('Error setting agent:', error);
        }
    });

    // Handle MCP selection
    socket.on('set_mcp', async (data) => {
        try {
            const { mcpAlias, mcpUrl } = data;
            const sessionId = socket.userData.currentSessionId;

            if (!sessionId) {
                console.warn('Attempted to set MCP with no active session');
                return;
            }

            // Update the MCP data in the session
            await projectSessionManager.setMcpData(sessionId, mcpAlias, mcpUrl);

            console.log(`Set MCP for session ${sessionId}: ${mcpAlias || 'none'}`);

        } catch (error) {
            console.error('Error setting MCP:', error);
        }
    });

    // Handle task pinned state
    socket.on('set_tasks_pinned', async (data) => {
        try {
            const { pinned } = data;
            const sessionId = socket.userData.currentSessionId;
            if (!sessionId) {
                console.warn('Attempted to set tasks pinned with no active session');
                return;
            }
            await projectSessionManager.setTasksPinned(sessionId, pinned);
            console.log(`Set tasks pinned for session ${sessionId}: ${pinned}`);
        } catch (error) {
            console.error('Error setting tasks pinned state:', error);
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
        const sessionId = socket.userData?.currentSessionId;
        if (sessionId && sessionSocketMap.has(sessionId)) {
            const sessionSockets = sessionSocketMap.get(sessionId);
            sessionSockets.delete(socket);
            
            if (sessionSockets.size === 0) {
                sessionSocketMap.delete(sessionId);
                // No need to explicitly unload - the ProjectSessionManager will do it when inactive
            }
        }
    });
    
    // Handle update notifications relay from clients
    socket.on('relay_update_available', (data) => {
        console.log('Received update notification relay:', data);
        
        // Broadcast to all connected sockets
        io.emit('update_available', data);
    });
});

// Main entry point - now a single page that handles everything
app.get('/', (req, res) => {
    res.render('main');
});

// Start the server only if not already running
const startExpressServer = async () => {
    try {
        // Start listening IMMEDIATELY - this ensures Electron gets the "ready" message
        // without waiting for MCP connections
        server.listen(port, () => {
            console.log(`Agent backend server listening on port ${port}`);
        });

        // Initialize MCP service AFTER server is already listening
        // This way, MCP connection issues won't block the app startup
        (async () => {
            console.log('Initializing MCP service...');
            try {
                await mcpService.initialize();
                console.log('MCP service initialized successfully');
            } catch (error) {
                console.error('MCP service initialization error (non-blocking):', error);
                // Server continues running even if MCP initialization fails
            }
        })(); // Fire-and-forget
    } catch (error) {
        if (error.code === 'EADDRINUSE') {
            console.log(`Port ${port} is already in use. Server may already be running.`);
        } else {
            console.error(`Error starting server: ${error.message}`);
        }
    }
};

// Listen for task events from ProjectSessionManager and forward to clients
sessionTaskEvents.on('task_diff_update', ({ sessionId, type, task, taskId }) => {
    const sockets = sessionSocketMap.get(sessionId);
    if (sockets) {
        sockets.forEach(socket => {
            socket.emit('task_diff_update', { sessionId, type, task, taskId });
        });
    }
});

// Listen for accounting updates and forward to clients
sessionAccountingEvents.on('updated', (data) => {
    const sockets = sessionSocketMap.get(data.sessionId);
    if (sockets) {
        sockets.forEach(socket => {
            // data already contains sessionId so no need to add it
            socket.emit('cost_update', data);
        });
    }
});

// Listen for token count updates and forward to clients
sessionAccountingEvents.on('token_count', (data) => {
    const sockets = sessionSocketMap.get(data.sessionId);
    if (sockets) {
        sockets.forEach(socket => {
            // data already contains sessionId so no need to add it
            socket.emit('token_count', data);
        });
    }
});

// Listen for tool log appends and forward to clients
sessionToolLogEvents.on('append', ({ sessionId, logEntry }) => {
    const sockets = sessionSocketMap.get(sessionId);
    if (sockets) {
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

// Check for updates and broadcast when a socket connects
io.on('connection', (socket) => {
    // Send update information to the client on connect
    const updateInfo = updateService.getUpdateInfo();
    if (updateInfo.updateAvailable) {
        socket.emit('update_available', {
            current: updateInfo.currentVersion,
            latest: updateInfo.latestVersion
        });
    }
});

// Start the server with async/await
(async () => {
    await startExpressServer();
})();