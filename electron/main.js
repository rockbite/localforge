import { app, BrowserWindow } from 'electron';
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
  const loadApp = () => {
    // Always load from localhost - the server needs to be running
    const serverUrl = 'http://localhost:3001';
    console.log('Connecting to server at:', serverUrl);
    
    // Open dev tools in packaged app if started with debug flag
    if (!isDev && process.argv.includes('--debug')) {
      win.webContents.openDevTools();
    }
    
    win.loadURL(serverUrl).catch(err => {
      console.error('Failed to connect to server:', err);
      // Try again after a delay - server might still be starting
      setTimeout(loadApp, 1000);
    });
  };
  
  // Give the server a moment to start
  setTimeout(loadApp, 500);

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
app.whenReady().then(() => {
  // Start the server first
  startServer();
  // Then create the window that will connect to it
  createWindow();
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