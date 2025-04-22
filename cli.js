#!/usr/bin/env node

const { execFileSync } = require('child_process');
const path = require('path');
const electron = require('electron');

// Run the actual Electron app
console.log('Starting Localforge...');
execFileSync(electron, [path.join(__dirname, 'electron/main.js')], {
  stdio: 'inherit'
});