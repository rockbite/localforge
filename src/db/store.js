// Unified local storage for Jeff‑AI: Conf for settings, LevelDB for projects/sessions
// -------------------------------------------------------------------------------

import os   from 'os';
import path from 'path';
import fs from 'fs/promises';
import Conf from 'conf';
import { Level } from 'level';

const CURRENT_SESSION_KEY = 'currentSessionId';

export class Store {
    constructor(projectName = 'localforge') {
        this.conf = new Conf({ projectName });
        this.projectName = projectName;

        // Set up file paths
        this.appDir = path.join(os.homedir(), `.${projectName}`);
        
        // Create necessary directories if they don't exist
        this._ensureDirectoriesExist();

        const dbPath = path.join(this.appDir, 'db');
        this.db      = new Level(dbPath, { valueEncoding: 'json' });

        this.dbReady = this.db.open();
    }
    
    async _ensureDirectoriesExist() {
        try {
            await fs.access(this.appDir);
        } catch (error) {
            await fs.mkdir(this.appDir, { recursive: true });
        }
    }

    /* ─────────── Settings ─────────── */
    getSetting(key, def)   { return this.conf.get(key, def); }
    setSetting(key, value) { this.conf.set(key, value); }
    getAllSettings()       { return this.conf.store; }
    
    /* ─────────── Model Settings Helpers ─────────── */
    getModelConfigFor(llmConfigName) {
        const models = this.getSetting('models', '{}');
        let modelsData;
        
        try {
            modelsData = typeof models === 'string' ? JSON.parse(models) : models;
        } catch (error) {
            console.error('Error parsing models data:', error);
            // Initialize with default empty structure instead of returning null
            modelsData = { providers: [], llmConfig: {} };
            
            // Store the fixed empty structure to prevent future parsing errors
            this.setSetting('models', JSON.stringify(modelsData));
        }
        
        const { providers = [], llmConfig = {} } = modelsData;
        
        // If no config exists for this name, return a default config
        if (!llmConfig[llmConfigName]) {
            // Return a default configuration with OpenAI/GPT-4 as fallback
            return {
                config: llmConfigName,
                model: 'gpt-4-turbo',  // Default model as fallback
                provider: {
                    name: 'openai',    // Default provider
                    type: 'openai',    // Default type
                    options: {}
                }
            };
        }
        
        const config = llmConfig[llmConfigName];
        const provider = providers.find(p => p.name === config.provider);
        
        // If provider reference is invalid, use default provider
        if (!provider) {
            return {
                config: llmConfigName,
                model: config.model || 'gpt-4-turbo',  // Use existing model or default
                provider: {
                    name: 'openai',    // Default provider
                    type: 'openai',    // Default type
                    options: {}
                }
            };
        }
        
        return {
            config: llmConfigName,
            model: config.model,
            provider: {
                name: provider.name,
                type: provider.type,
                options: provider.options || {}
            }
        };
    }

    findProviderById(name) {
        let list = this.getProviderList();
        for(let idx in list) {
            let elem = list[idx];
            if(elem.name === name) {
                return elem;
            }
        }

        return null;
    }

    getProviderList() {
        const models = this.getSetting('models', '{}');
        let modelsData;
        
        try {
            modelsData = typeof models === 'string' ? JSON.parse(models) : models;
        } catch (error) {
            console.error('Error parsing models data:', error);
            // Initialize with default empty structure instead of returning empty array
            modelsData = { providers: [], llmConfig: {} };
            
            // Store the fixed empty structure to prevent future parsing errors
            this.setSetting('models', JSON.stringify(modelsData));
        }
        
        return modelsData.providers || [];
    }
    
    getLlmConfigList() {
        const models = this.getSetting('models', '{}');
        let modelsData;
        
        try {
            modelsData = typeof models === 'string' ? JSON.parse(models) : models;
        } catch (error) {
            console.error('Error parsing models data:', error);
            // Initialize with default empty structure instead of returning empty object
            modelsData = { providers: [], llmConfig: {} };
            
            // Store the fixed empty structure to prevent future parsing errors
            this.setSetting('models', JSON.stringify(modelsData));
        }
        
        return modelsData.llmConfig || {};
    }

    /* ─────────── Projects ─────────── */
    async createProject(name) {
        await this.dbReady;
        const id   = `proj_${Date.now().toString(36)}`;
        const meta = { name, createdAt: Date.now(), updatedAt: Date.now() };
        await this.db.put(`project:${id}:meta`, meta);
        return id;
    }

    async listProjects() {
        await this.dbReady;
        const out = [];
        for await (const [k, v] of this.db.iterator({ gte: 'project:', lte: 'project:~' })) {
            if (k.endsWith(':meta')) out.push({ id: k.split(':')[1], ...v });
        }
        return out.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async updateProjectMeta(id, updates) {
        await this.dbReady;
        let meta;
        try { meta = await this.db.get(`project:${id}:meta`); } catch { return null; }
        const newMeta = { ...meta, ...updates, updatedAt: Date.now() };
        await this.db.put(`project:${id}:meta`, newMeta);
        return newMeta;
    }

    async deleteProject(id) {
        await this.dbReady;
        const sessions = await this.listSessionsForProject(id);
        const batch    = this.db.batch().del(`project:${id}:meta`);
        for (const s of sessions) batch.del(`session:${s.id}:meta`).del(`session:${s.id}:data`);
        await batch.write();
        const { projectId } = await this.getCurrentIds();
        if (projectId === id) await this.clearCurrentSession();
    }

    /* ─────────── Sessions ─────────── */
    async createSession(projectId, name, data = {}) {
        await this.dbReady;
        await this.db.get(`project:${projectId}:meta`); // throws if project missing

        const id  = `sess_${Date.now().toString(36)}`;
        const now = Date.now();

        await this.db.batch()
            .put(`session:${id}:meta`, { name, projectId, createdAt: now, updatedAt: now })
            .put(`session:${id}:data`, { ...data, updatedAt: now })
            .write();

        await this._touchProject(projectId);
        return id;
    }

    async updateSessionMeta(id, updates) {
        await this.dbReady;
        let meta;
        try { meta = await this.db.get(`session:${id}:meta`); } catch { return null; }
        const newMeta = { ...meta, ...updates, updatedAt: Date.now() };
        await this.db.put(`session:${id}:meta`, newMeta);
        await this._touchProject(newMeta.projectId);
        return newMeta;
    }

    async updateSessionData(id, updates) {
        await this.dbReady;
        const curr = await this.db.get(`session:${id}:data`);
        const data = { ...curr, ...updates, updatedAt: Date.now() };
        await this.db.put(`session:${id}:data`, data);
        await this._touchSessionMeta(id);
        return data;
    }
    
    /**
     * Sets (replaces) all session data - unlike updateSessionData which merges.
     * @param {string} id - Session ID
     * @param {object} newData - Complete new data object to replace existing data
     * @returns {object} The saved data object (with updatedAt timestamp)
     */
    async setSessionData(id, newData) {
        await this.dbReady;                 // validate the DB is open
        await this.getSessionMeta(id);      // throw if session missing

        // 1. deep‑clone so nobody else can mutate it behind our back
        const clone = JSON.parse(JSON.stringify(newData));
        clone.updatedAt = Date.now();

        // 2. delete‑then‑put guarantees the old record is gone
        await this.db.batch()
            .del(`session:${id}:data`)
            .put(`session:${id}:data`, clone)
            .write();

        await this._touchSessionMeta(id);
        return clone;                       // handy for the caller
    }

    async getSessionMeta(id) { await this.dbReady; return this.db.get(`session:${id}:meta`); }
    async getSessionData(id) { await this.dbReady; return this.db.get(`session:${id}:data`); }

    async listSessionsForProject(projectId) {
        await this.dbReady;
        const res = [];
        for await (const [k, v] of this.db.iterator({ gte: 'session:', lte: 'session:~' })) {
            if (k.endsWith(':meta') && v.projectId === projectId) res.push({ id: k.split(':')[1], ...v });
        }
        // Sort by creation date instead of update date for consistent ordering
        return res.sort((a, b) => a.createdAt - b.createdAt); // Oldest first
    }

    async deleteSession(id) {
        await this.dbReady;
        await this.db.batch().del(`session:${id}:meta`).del(`session:${id}:data`).write();
        const { sessionId } = await this.getCurrentIds();
        if (sessionId === id) await this.clearCurrentSession();
        return true;
    }

    /* ─────────── Current helpers ─────────── */
    async setCurrentSession(sessionId) {
        await this.dbReady;
        await this.getSessionMeta(sessionId); // validate
        this.conf.set(CURRENT_SESSION_KEY, sessionId);
        // No longer updating the session timestamp when selected
    }

    async getCurrentIds() {
        await this.dbReady;
        const sessionId = this.conf.get(CURRENT_SESSION_KEY, null);
        if (!sessionId) return { sessionId: null, projectId: null };
        try {
            const meta = await this.getSessionMeta(sessionId);
            return { sessionId, projectId: meta.projectId };
        } catch {
            await this.clearCurrentSession();
            return { sessionId: null, projectId: null };
        }
    }

    async clearCurrentSession() {
        this.conf.delete(CURRENT_SESSION_KEY);
    }

    /* ─────────── House‑keeping ─────────── */
    async close() { await this.dbReady; await this.db.close(); }

    /* ─────────── Internals ─────────── */
    async _touchSessionMeta(id) {
        const meta = await this.db.get(`session:${id}:meta`);
        meta.updatedAt = Date.now();
        await this.db.put(`session:${id}:meta`, meta);
        await this._touchProject(meta.projectId);
    }

    async _touchProject(id) {
        const meta = await this.db.get(`project:${id}:meta`);
        meta.updatedAt = Date.now();
        await this.db.put(`project:${id}:meta`, meta);
    }

    /* ─────────── Boot‑strap ─────────── */
    async ensureDefaultProjectExists() {
        await this.dbReady;
        if ((await this.listProjects()).length) return null;

        const projectId = await this.createProject('Default Project');
        const sessionId = await this.createSession(projectId, 'Coding Agent',
            { directory: null, conversation: [] });
        await this.setCurrentSession(sessionId);

        return { projectId, sessionId };
    }
}

/* singleton */
export const store = new Store();
export default store;
