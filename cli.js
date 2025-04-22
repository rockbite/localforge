#!/usr/bin/env node

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import electron from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run the actual Electron app
console.log('Starting Localforge...');
execFileSync(electron, [path.join(__dirname, 'electron/main.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    GLOBAL_NPM_INSTALL: 'true' // Set environment variable to indicate global npm installation
  }
});