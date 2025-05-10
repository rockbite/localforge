// src/logic/mcp.js (the library)
/**
 * Class MCPLibrary
 *
 * can add mcp client, or edit existing one using alias, or delete one
 * each call will result in connecting, or closing a connection (or reconnecting) to an MCP server using mcp client
 * e.g. it will create mcp client per alias, or reconnect or close existing one. maintaining a map of always connected MCP clients
 * to which we can send requests.
 *
 * exposed methods are to add, remove edit mcp client
 * and to fetch mcp client, and for an mcp client to call its methods
 *
 * use https://www.npmjs.com/package/@modelcontextprotocol/sdk
 *
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
 *
 * for client stuff.
 *
 * idea here is that MCPLibrary can have multiple cleints connected (and if needed reconnecting) to be used at any moment
 *
 */

// mcplibrary.js
// -----------------------------------------------------------------------------
// A tiny registry that keeps *live* MCP client connections keyed by alias.
// Uses @modelcontextprotocol/sdk, with Stdio transport by default.
// -----------------------------------------------------------------------------

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';


/**
 * Shape of the object you pass to `addClient()` / `editClient()`.
 *
 * @typedef {Object} MCPConnectionOptions
 * @property {string} command             – executable to run (e.g. `"node"`)
 * @property {string[]} [args]            – argv list for the command
 * @property {string} [name="mcplibrary"] – client-name sent in the handshake
 * @property {string} [version="0.0.0"]   – client-version sent in the handshake
 */

/**
 * MCPLibrary
 *
 * Manages multiple *always-connected* MCP clients.
 * ────────────────────────────────────────────────────────────────────────────
 *  addClient(alias, opts)    → creates + connects a new client
 *  editClient(alias, opts)   → reconnects with new settings
 *  removeClient(alias)       → closes & removes
 *  getClient(alias)          → returns the live Client instance
 *
 * Optional helpers:
 *  callTool(alias, callObj)  → straight proxy for client.callTool()
 *  listTools(alias)          → straight proxy for client.listTools()
 */
export class MCPLibrary {
    /** @private */
    #registry = new Map(); // alias → { client, transport, opts }

    /**
     * Add a brand-new MCP client and connect immediately.
     * Throws if alias already exists.
     *
     * @param {string} alias
     * @param {MCPConnectionOptions} opts
     * @returns {Promise<Client>}
     */
    async addClient(alias, opts) {
        if (this.#registry.has(alias)) {
            throw new Error(`MCP client alias '${alias}' already exists`);
        }
        const entry = await this.#connect(opts);
        this.#registry.set(alias, { ...entry, opts });
        return entry.client;
    }

    /**
     * Reconnect an existing alias with new options.
     * Client keeps the same alias, but everything else is brand-new.
     *
     * @param {string} alias
     * @param {MCPConnectionOptions} opts
     * @returns {Promise<Client>}
     */
    async editClient(alias, opts) {
        await this.removeClient(alias);       // idempotent if alias didn’t exist
        return this.addClient(alias, opts);
    }

    /**
     * Close the connection and delete the alias.
     *
     * @param {string} alias
     * @returns {Promise<void>}
     */
    async removeClient(alias) {
        const entry = this.#registry.get(alias);
        if (!entry) return; // nothing to do
        await this.#disconnect(entry);
        this.#registry.delete(alias);
    }

    /**
     * Get the live MCP Client instance.
     *
     * @param {string} alias
     * @returns {Client}
     */
    getClient(alias) {
        const entry = this.#registry.get(alias);
        if (!entry) throw new Error(`No MCP client registered under alias '${alias}'`);
        return entry.client;
    }

    // ────────────────────── convenience proxies ──────────────────────────────

    /** @returns {Promise<Awaited<ReturnType<Client["listTools"]>>>} */
    listTools(alias) {
        return this.getClient(alias).listTools();
    }

    /** @returns {Promise<Awaited<ReturnType<Client["callTool"]>>>} */
    callTool(alias, callObj) {
        return this.getClient(alias).callTool(callObj);
    }

    // ────────────────────── internals ─────────────────────────────────────────

    /** @private */
    async #connect(opts) {
        const {
            url,
            command,
            args = [],
            name = 'mcplibrary',
            version = '0.0.0'
        } = opts;

        let transport = new SSEClientTransport(new URL(url));

        const client = new Client({ name, version });
        await client.connect(transport);          // throws if handshake fails
        return { client, transport };
    }

    /** @private */
    async #disconnect({ client, transport }) {
        // Gracefully close whatever APIs the sdk exposes. 1.11.x has both.
        if (typeof client.close === 'function') await client.close().catch(() => {});
        else if (typeof client.disconnect === 'function') await client.disconnect().catch(() => {});

        if (typeof transport.close === 'function') await transport.close().catch(() => {});
    }
}

// -----------------------------------------------------------------------------
// Usage example:
//
// const lib = new MCPLibrary();
//
// await lib.addClient('local-weather', {
//   command: 'node',
//   args: ['weather-server.js'],
//   name: 'weather-ui',
//   version: '1.2.0'
// });
//
// const tools = await lib.listTools('local-weather');
// const res   = await lib.callTool('local-weather', {
//   name: 'fetch-weather',
//   arguments: { city: 'Yerevan' }
// });
//
// console.log(res);
// -----------------------------------------------------------------------------
