#!/usr/bin/env node

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import electron from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Run the actual Electron app
console.log('Starting Localforge...');

// Store the original working directory to preserve it through the app start
const userCwd = process.cwd();

// Added additional environment vars to help Windows handle paths correctly
execFileSync(electron, [path.join(__dirname, 'electron/main.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    GLOBAL_NPM_INSTALL: 'true', // Set environment variable to indicate global npm installation
    USER_CWD: userCwd,           // Pass the user's current working directory
    APP_BASE_PATH: __dirname     // Pass the application's base directory
  }
});