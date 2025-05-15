// service/mcp/index.js
// MCP Service - provides global access to MCPLibrary instance
// -------------------------------------------------------
// Creates a singleton instance of MCPLibrary that can be used throughout the app
// Initializes connections based on settings and provides methods to manage MCP clients

import { MCPLibrary } from '../../logic/mcp.js';
import store from '../../db/store.js';

/**
 * Singleton class that maintains a global MCPLibrary instance
 */
class MCPService {
    constructor() {
        // Initialize the MCPLibrary instance
        this.mcpLibrary = new MCPLibrary();
        this.initialized = false;
    }

    /**
     * Initialize the MCP service with settings from the store
     * This should be called once at server startup
     */
    async initialize() {
        if (this.initialized) {
            console.log('MCP Service already initialized, skipping');
            return;
        }

        try {
            // Get MCP servers from settings
            const mcpServersJson = store.getSetting('mcpServers') || '[]';
            const mcpServers = JSON.parse(mcpServersJson);
            
            if (mcpServers.length > 0) {
                console.log(`Initializing ${mcpServers.length} MCP connections...`);
                
                // Add each MCP client to the library
                for (const server of mcpServers) {
                    try {
                        await this.addClient(server.alias, server.url);
                        console.log(`Connected to MCP server: ${server.alias}`);
                    } catch (error) {
                        console.error(`Failed to connect to MCP server ${server.alias}:`, error);
                    }
                }
            } else {
                console.log('No MCP servers configured in settings');
            }
            
            this.initialized = true;
        } catch (error) {
            console.error('Error initializing MCP service:', error);
            throw error; // Re-throw to allow caller to handle
        }
    }

    async makeOptsFromUrl(inputUrl) {

        let url;
        let command;
        let args = [];

        if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
            url = inputUrl;
            const urlObj = new URL(url);
            command = 'node'; // Assuming it's a Node.js MCP server
            args = [urlObj.pathname]; // Using the path as a script file to run
        } else {
            // This is likely a command
            const parts = inputUrl.split(' ');
            command = parts[0];
            args = parts.slice(1);
        }

        let ops = {
            url,
            command,
            args,
            name: 'localforge', // Client name sent in handshake
            version: '1.0.0'    // Client version sent in handshake
        };

        return ops;
    }

    /**
     * Add a new MCP client with the specified alias and URL
     * @param {string} alias - The unique identifier for this MCP client
     * @param {string} url - The URL or command to connect to the MCP server
     * @returns {Promise<void>}
     */
    async addClient(alias, url) {
        // Simple URL-based MCP connection

        let opts = await this.makeOptsFromUrl(url);
        
        // Add the client to the MCPLibrary
        await this.mcpLibrary.addClient(alias, opts);
    }

    /**
     * Update an existing MCP client with new URL
     * @param {string} alias - The alias of the MCP client to edit
     * @param {string} url - The new URL for the MCP server
     * @returns {Promise<void>}
     */
    async editClient(alias, url) {
        let opts = await this.makeOptsFromUrl(url);
        
        // Edit the client in the MCPLibrary
        await this.mcpLibrary.editClient(alias, opts);
    }

    /**
     * Remove an MCP client
     * @param {string} alias - The alias of the MCP client to remove
     * @returns {Promise<void>}
     */
    async removeClient(alias) {
        await this.mcpLibrary.removeClient(alias);
    }

    /**
     * Sync the MCPLibrary with the current settings
     * This will add, edit, or remove clients as needed
     * @returns {Promise<void>}
     */
    async syncWithSettings() {
        try {
            // Get the current MCP servers from settings
            const mcpServersJson = store.getSetting('mcpServers') || '[]';
            const mcpServers = JSON.parse(mcpServersJson);
            
            // Get the current list of aliases in the library
            const currentAliases = this.getClientAliases();
            
            // Track which aliases should remain
            const newAliases = new Set(mcpServers.map(server => server.alias));
            
            // Remove clients that are no longer in settings
            for (const alias of currentAliases) {
                if (!newAliases.has(alias)) {
                    console.log(`Removing MCP client: ${alias}`);
                    await this.removeClient(alias);
                }
            }
            
            // Add or update clients from settings
            for (const server of mcpServers) {
                if (currentAliases.includes(server.alias)) {
                    // Client exists, update it
                    console.log(`Updating MCP client: ${server.alias}`);
                    await this.editClient(server.alias, server.url);
                } else {
                    // New client, add it
                    console.log(`Adding new MCP client: ${server.alias}`);
                    await this.addClient(server.alias, server.url);
                }
            }
            
            console.log('MCP library successfully synced with settings');
        } catch (error) {
            console.error('Error syncing MCP library with settings:', error);
            throw error;
        }
    }

    /**
     * Get a list of all client aliases currently in the library
     * @returns {string[]} - Array of client aliases
     */
    getClientAliases() {
        // Since MCPLibrary doesn't expose a method to get all registry entries,
        // we'll track aliases during initialization and modification

        // For now, let's get the current MCP servers from settings
        // This assumes the MCPLibrary's state matches the settings
        try {
            const mcpServersJson = store.getSetting('mcpServers') || '[]';
            const mcpServers = JSON.parse(mcpServersJson);
            return mcpServers.map(server => server.alias);
        } catch (error) {
            console.error('Error getting client aliases:', error);
            return [];
        }
    }

    /**
     * Get the MCPLibrary instance for direct access
     * @returns {MCPLibrary}
     */
    getMCPLibrary() {
        return this.mcpLibrary;
    }

    /**
     * Get an MCP client by alias
     * @param {string} alias - The alias of the MCP client to get
     * @returns {Client} - The MCP Client instance
     */
    getClient(alias) {
        return this.mcpLibrary.getClient(alias);
    }

    /**
     * Execute a tool call that came straight out of OpenAI
     *     – supports the new 2024-04 `tool_calls` array
     *     – supports the legacy single `function_call`
     *
     * @param {string} alias               – MCP client alias
     * @param {object} openAIToolCall      – one element of message.tool_calls, or
     *                                       message.function_call
     * @returns {Promise<unknown>}         – whatever the MCP tool returns
     */
    async callTool(alias, openAIToolCall) {
        let name, rawArgs;

        // new format:  {id, type:"function", function:{name, arguments}}
        if (openAIToolCall?.type === 'function') {
            name    = openAIToolCall.function?.name;
            rawArgs = openAIToolCall.function?.arguments;

            // old format:  {name, arguments} hanging off message.function_call
        } else if (openAIToolCall?.name) {
            name    = openAIToolCall.name;
            rawArgs = openAIToolCall.arguments;

        } else {
            throw new Error('Unrecognised OpenAI tool-call shape');
        }

        // arguments can be stringified JSON or already an object
        let args;
        if (typeof rawArgs === 'string') {
            try {
                args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
            } catch (e) {
                throw new Error(`Malformed arguments JSON for tool "${name}": ${e.message}`);
            }
        } else if (typeof rawArgs === 'object' && rawArgs !== null) {
            args = rawArgs;
        } else {
            args = {};
        }

        const result = await this.mcpLibrary.callTool(alias, {name: name, arguments: args});

        return result;
    }


    /**
     * List available tools for an MCP client
     * @param {string} alias - The alias of the MCP client to use
     * @returns {Promise<any>} - The list of available tools
     */
    async listTools(alias) {
        // 1. Pull the raw list from the live client
        //    (SDK returns { tools: […] } – if your MCPLibrary returns plain
        //     array instead, delete the de-structuring.)
        const { tools } = await this.mcpLibrary.listTools(alias);

        // 2. Map to OpenAI format
        return tools.map(t => ({
            type: 'function',
            function: {
                name:        t.name,
                description: t.description ?? '',
                parameters:  normaliseSchema(t.inputSchema)
            }
        }));
    }


}

function normaliseSchema(schema = {}) {
    if (!schema.type) {
        schema.type       = 'object';
        schema.properties = schema.properties ?? {};
        schema.required   = schema.required   ?? [];
    }

    if (typeof schema.additionalProperties !== 'boolean') {
        schema.additionalProperties = false;
    }
    return schema;
}

// Export a singleton instance
const mcpService = new MCPService();
export default mcpService;