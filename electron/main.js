#!/usr/bin/env node

// DEBUG: trace any explicit exit
const _exit = process.exit;
process.exit = function (code = 0) {
  console.trace(`process.exit(${code}) called`);
  _exit(code);
};

import { app, BrowserWindow, dialog, shell, ipcMain } from 'electron';
app.setName('Localforge'); // has to be as early as possible
import path from 'path';
import { fileURLToPath } from 'url';
import { startServer } from './server.js';
import https from 'https';
import fetch from 'node-fetch';
import semver from 'semver';
import fs, { readFileSync } from 'fs';
import {exec} from "child_process";
import {runUpdate} from "./updater.js";
import net from 'net';

function findPort(preferred) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => {
        const tmp = net.createServer()
          .once('listening', () => {
            const { port } = tmp.address();
            tmp.close(() => resolve(port));
          })
          .listen(0);
      })
      .once('listening', () => {
        tester.close(() => resolve(preferred));
      })
      .listen(preferred);
  });
}


let serverProcess;

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load package.json to get app version
const packagePath = path.resolve(__dirname, '../package.json');
const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));

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
let latestVersion; // Removing unused variable declarations helps clean up code

const iconPath = path.join(__dirname, 'assets', 'icon.png'); // Adjust path if needed, normally need to use *.icns

// Function to handle downloading and relaunch (placeholder - actual update logic would depend on your distribution method)
function downloadAndRelaunch(version) {
  // In a real implementation, you'd download the new version and update the app
  // For now, we'll just show a dialog prompting the user to update manually
  const updateUrl = `https://www.npmjs.com/package/${pkg.name}/v/${version}`;
  
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'Update Available',
    message: `A new version (${version}) is available!`,
    detail: `You are currently running version ${pkg.version}. Would you like to download the update?`,
    buttons: ['Later', 'Download Update'],
    defaultId: 1
  }).then(({ response }) => {
    if (response === 1) {
      runUpdate();
    }
  });
}

// Check for npm package updates
function checkForNpmUpdate() {
  console.log(`Checking for updates. Current version: ${pkg.version}`);
  
  https.get(`https://registry.npmjs.org/${pkg.name}/latest`, res => {
    let body = '';
    res.on('data', chunk => (body += chunk));
    res.on('end', () => {
      try {
        latestVersion = JSON.parse(body).version;
        console.log(`Latest version available: ${latestVersion}`);
        
        if (semver.gt(latestVersion, pkg.version)) {
          console.log(`Update available: ${latestVersion}`);
          updateAvailable = true;
          
          // Notify renderer process about update
          if (win && win.webContents) {
            win.webContents.send('update-available', {
              current: pkg.version,
              latest: latestVersion
            });
          }
        } else {
          console.log('Application is up to date');
          updateAvailable = false;
        }
      } catch (error) {
        console.error('Error parsing npm registry response:', error);
      }
    });
  }).on('error', (error) => {
    console.error('Error checking for updates:', error.message);
  });
}

export function createWindow(port) {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'assets', 'icon.png'), // Adjust path if needed
    backgroundColor: '#222222',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
  });

  // ⬇️  Anything the front-end logs will show up here
  win.webContents.on('console-message',
      (_event, level, message, line, sourceId) => {
        // Chromium gives the log level as 0-3 (0 = log, 1 = warn, 2 = error, 3 = info)
        const lvl = ['log', 'warn', 'error', 'info'][level] || 'log';
        console[lvl](`[renderer] ${sourceId}:${line}  ${message}`);
      });


  // Log preload path for debugging
  console.log('Preload script path:', path.join(__dirname, 'preload.js'));

  // --- MODIFIED DEVTOOLS LOGIC ---
  const isGlobalInstall = process.env.GLOBAL_NPM_INSTALL === 'true';

  win.once('ready-to-show', () => {
    console.log('Window ready to show, making visible.');
    win.show();
  });

  win.webContents.on('did-finish-load', () => {
    console.log('Window finished loading');
    // Update checks are now handled by the server
  });

  const isDev = !app.isPackaged;
  const serverUrl = `http://localhost:${port}`;
  let retryCount = 0;
  const maxRetries = 10; // Try for 10 seconds

  const loadApp = () => {
    console.log(`Attempting to load ${serverUrl} (Attempt ${retryCount + 1})`);
    
    if (!win) return; // Window might have been closed

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

  loadApp();

  win.on('closed', () => {
    win = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  console.log('App ready, starting server...');

  // This MUST be done after app is ready and only on macOS
  if (process.platform === 'darwin') {
    console.log('Setting Dock icon for macOS using path:', iconPath);
    // Optional: Check if file exists before setting
    // try { fs.accessSync(iconPath, fs.constants.R_OK); console.log('Icon file exists for Dock.'); } catch (err) { console.error('ICON FILE ERROR for Dock:', err); }

    // Set the Dock icon using the file path
    app.dock.setIcon(iconPath);
  }

  let port;
  try {
    port = await findPort(3826);          // pick the port
    process.env.LOCALFORGE_PORT = String(port);      // child uses it

    serverProcess = startServer();        // unchanged API
    console.log(`Server spawn OK (port ${port})`);

    // Pass port to window if not waiting for stdout to do it
    if (!serverProcess || !serverProcess.stdout) {
      createWindow(port);
    }
  } catch (error) {
    console.error("Error initiating server start:", error);
    dialog.showErrorBox('Fatal Error', `Could not initiate the server process. The application cannot start.\n\n${error.message}`);
    app.quit();
    return;
  }
  
  // Set up IPC handler for update dialog
  ipcMain.on('show-update-dialog', () => {
    // Send IPC to get update status from server via fetch request
    fetch(`http://localhost:${port}/api/updates`).then(res => res.json())
      .then(updateInfo => {
        if (updateInfo.updateAvailable) {
          downloadAndRelaunch(updateInfo.latestVersion);
        }
      })
      .catch(err => {
        console.error('Error checking for updates in dialog handler:', err);
      });
  });
  
  // Set up IPC handler for directory picker dialog
  ipcMain.handle('show-directory-picker', async () => {
    try {
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Working Directory'
      });
      
      if (result.canceled) {
        return { canceled: true };
      }
      
      return { 
        canceled: false, 
        filePath: result.filePaths[0] 
      };
    } catch (error) {
      console.error('Error showing directory picker:', error);
      return {
        canceled: true,
        error: error.message
      };
    }
  });

  // Show a save dialog and return the path
  ipcMain.handle('show-save-dialog', async (_event, options) => {
    try {
      const result = await dialog.showSaveDialog(win, options);
      if (result.canceled) {
        return { canceled: true };
      }
      return { canceled: false, filePath: result.filePath };
    } catch (error) {
      console.error('Error showing save dialog:', error);
      return { canceled: true, error: error.message };
    }
  });

  // Save file contents to disk
  ipcMain.handle('save-file', async (_event, filePath, data) => {
    try {
      await fs.promises.writeFile(filePath, data, 'utf8');
      return { success: true };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if(serverProcess) {
    serverProcess.kill(); // Ensure server process is killed
    console.log('Server process killed.');
  }
  app.quit();
});