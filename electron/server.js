import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { app } from 'electron';
import fs from 'fs';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer() {
  const isDev = !app.isPackaged;
  let serverProcess;
  
  // Determine base path for the app
  const basePath = isDev ? path.join(__dirname, '..') : app.getAppPath();
  console.log(`Starting server from base path: ${basePath}`);
  
  // In production, check if we're running from an asar package
  if (!isDev) {
    console.log(`Running in production mode from: ${app.getAppPath()}`);
    console.log(`Executable path: ${app.getPath('exe')}`);
  }
  
  // Path to server script
  const serverScript = path.join(basePath, 'src', 'index.js');
  
  console.log(`Server script path: ${serverScript}`);
  console.log(`File exists: ${fs.existsSync(serverScript) ? 'Yes' : 'No'}`);
  
  // Always use direct node process for starting server
  const nodeExecutable = isDev ? 'node' : process.execPath;
  const nodeArgs = isDev ? [serverScript] : ['--no-sandbox', serverScript];
  
  if (!isDev) {
    // In production, make sure Node can find the modules
    process.env.ELECTRON_RUN_AS_NODE = '1';
  }
  
  console.log(`Starting server with: ${nodeExecutable} ${nodeArgs.join(' ')}`);
  
  serverProcess = spawn(nodeExecutable, nodeArgs, {
    cwd: basePath,
    stdio: 'inherit',
    shell: isDev, // Only use shell in development
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // Required for running Node scripts with Electron binary
    }
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server process:', err);
  });
  
  serverProcess.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
  });
  
  process.on('exit', () => {
    if (serverProcess) {
      console.log('Main process exiting, killing server process');
      serverProcess.kill();
    }
  });
  
  return serverProcess;
}