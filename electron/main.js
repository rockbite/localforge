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
    // In production, we need to look for the index.html in the resources directory
    const prodPath = path.join(path.dirname(__dirname), 'dist', 'index.html');
    console.log('Trying to load from path:', isDev ? 'http://localhost:3001' : `file://${prodPath}`);
    
    win.loadURL(
      isDev ? 'http://localhost:3001' : `file://${prodPath}`
    ).catch(err => {
      console.error('Failed to load URL:', err);
      setTimeout(loadApp, 500); // Try again after a brief delay if server isn't ready
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