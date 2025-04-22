#!/usr/bin/env node

import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
let electronSquirrelStartup = false;
try {
  // Need to use dynamic import for ESM compatibility
  electronSquirrelStartup = (await import('electron-squirrel-startup')).default;
} catch (err) {
  // Module may not be installed or needed
  console.log('electron-squirrel-startup not available');
}

if (electronSquirrelStartup) {
  app.quit();
}

let win;
let serverHasStarted = false; // Flag to track server start attempt

function createWindow() {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = !app.isPackaged;
  const serverUrl = 'http://localhost:3001';
  let retryCount = 0;
  const maxRetries = 10; // Try for 10 seconds

  const loadApp = () => {
    console.log(`Attempting to load ${serverUrl} (Attempt ${retryCount + 1})`);
    
    if (!win) return; // Window might have been closed

    // Optional: Open dev tools in packaged app if started with debug flag
    if (!isDev && process.argv.includes('--debug') && !win.webContents.isDevToolsOpened()) {
      win.webContents.openDevTools();
    }

    win.loadURL(serverUrl)
      .then(() => {
        console.log(`Successfully loaded ${serverUrl}`);
        serverHasStarted = true; // Mark as successful
      })
      .catch(err => {
        console.error(`Failed to load ${serverUrl}:`, err.message);
        retryCount++;
        if (retryCount < maxRetries && win) {
          // Try again after a delay - server might still be starting
          console.log(`Retrying in 1 second...`);
          setTimeout(loadApp, 1000);
        } else if (win) {
          // Max retries reached or window closed
          console.error('Max retries reached. Could not connect to the server.');
          // Load an error page or show a dialog
          if (serverHasStarted) {
            // If server started once but became unreachable
            dialog.showErrorBox(
              'Connection Error',
              `Lost connection to the local server at ${serverUrl}. Please restart the application.`
            );
          } else {
            // If server never started
            dialog.showErrorBox(
              'Server Start Error',
              `The application server failed to start or become reachable at ${serverUrl}. Please check logs or restart.`
            );
          }
        }
      });
  };

  // Give the server more time to start initially
  console.log('Waiting 3 seconds for server to potentially start...');
  setTimeout(loadApp, 3000); // Increased initial delay

  // Open the DevTools in development mode
  if (isDev) {
    win.webContents.openDevTools();
  }

  win.on('closed', () => {
    win = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  console.log('App ready, starting server...');
  try {
    startServer(); // Start the server process
    console.log('Server process spawn initiated. Creating window...');
  } catch (error) {
    console.error("Error initiating server start:", error);
    dialog.showErrorBox('Fatal Error', `Could not initiate the server process. The application cannot start.\n\n${error.message}`);
    app.quit();
    return;
  }
  
  createWindow(); // Create the window, which will then try to connect
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (win === null) {
    createWindow();
  }
});