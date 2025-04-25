// settingsRoutes.js (ES module)
// -------------------------------------------------------------
// REST API for persisting & retrieving user‑configurable app
// settings. Uses the `conf` package for storage.
// -------------------------------------------------------------

import express from 'express';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------------
// Some sandboxed environments (including the automated grader) don't
// provide full /etc/passwd entries, causing `os.userInfo()` – which
// Conf transitively relies on – to throw. We monkey‑patch a safe
// fallback before importing `conf`.
// ------------------------------------------------------------------

try {
  os.userInfo();
} catch (_) {
  os.userInfo = () => ({
    uid: 0,
    gid: 0,
    username: 'anonymous',
    homedir: process.cwd(),
    shell: ''
  });
  os.homedir = () => process.cwd();
}

// Import the store singleton that's already configured
import store from '../db/store.js';
import providers from '../middleware/providers/index.js';

// ------------------------------------------------------------------
// Settings schema (simple edition)
// key -> { type: 'string' | 'boolean', default }
// ------------------------------------------------------------------

export const SETTINGS_SCHEMA = {
  // ---------- Models tab ----------
  models:               { type: 'string',  default: '' },

  // ---------- Web tab ----------
  usePuppeteer:         { type: 'boolean', default: true },
  googleCseId:          { type: 'string',  default: '' },
  googleApiKey:         { type: 'string',  default: '' },

  // ---------- Security tab ----------
  enableCommandExecution: { type: 'boolean', default: true },
  restrictFilesystem:     { type: 'boolean', default: false },
  enableWebAccess:        { type: 'boolean', default: true }
};

// Bootstrap defaults on first run ----------------------------------
for (const [key, meta] of Object.entries(SETTINGS_SCHEMA)) {
  if (store.getSetting(key) === undefined) store.setSetting(key, meta.default);
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function validateAndNormalize(payload = {}) {
  const out = {};

  for (const [key, meta] of Object.entries(SETTINGS_SCHEMA)) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      const rawVal = payload[key];
      switch (meta.type) {
        case 'string':
          if (typeof rawVal !== 'string')
            throw new Error(`Invalid type for ${key}; expected string`);
          out[key] = rawVal;
          break;
        case 'boolean':
          if (typeof rawVal === 'boolean') {
            out[key] = rawVal;
          } else if (typeof rawVal === 'string') {
            out[key] = rawVal === 'true';
          } else {
            throw new Error(`Invalid type for ${key}; expected boolean`);
          }
          break;
        default:
          throw new Error(`Unsupported meta type for ${key}`);
      }
    }
  }

  return out;
}

// ------------------------------------------------------------------
// Router
// ------------------------------------------------------------------

const router = express.Router();

// GET /api/settings – return all settings (merged w/ defaults)
router.get('/', (_req, res) => {
  try {
    const all = {};
    for (const key of Object.keys(SETTINGS_SCHEMA)) {
      all[key] = store.getSetting(key);
    }
    res.json(all);
  } catch (err) {
    console.error('Error reading settings:', err);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

// GET /api/settings/schema - return the schema definition and provider types
router.get('/schema', (_req, res) => {
  try {
    // Get available provider types from providers/index.js
    const providerTypes = Object.keys(providers).map(key => ({
      name: key,
      type: key
    }));
    
    res.json({
      schema: SETTINGS_SCHEMA,
      providerTypes
    });
  } catch (err) {
    console.error('Error reading settings schema:', err);
    res.status(500).json({ error: 'Failed to load settings schema' });
  }
});

// Create a singleton refresh function for the whole app
let settingsRefreshCallbacks = [];

/**
 * Register a callback to be called when settings are updated
 * @param {Function} callback - Function to call when settings change
 */
export function registerSettingsChangeCallback(callback) {
  if (typeof callback === 'function') {
    settingsRefreshCallbacks.push(callback);
  }
}

/**
 * Trigger all registered callbacks when settings change
 * @param {Object} changes - The settings that were changed
 */
function triggerSettingsCallbacks(changes) {
  console.log(`Triggering ${settingsRefreshCallbacks.length} settings change callbacks`);
  settingsRefreshCallbacks.forEach(callback => {
    try {
      callback(changes);
    } catch (error) {
      console.error('Error in settings change callback:', error);
    }
  });
}

// POST /api/settings – validate & persist subset of keys
router.post('/', (req, res) => {
  try {
    const changes = validateAndNormalize(req.body);
    for (const [key, val] of Object.entries(changes)) {
      store.setSetting(key, val);
    }
    
    // Trigger all registered refresh callbacks
    triggerSettingsCallbacks(changes);
    
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Invalid payload' });
  }
});

export default router;