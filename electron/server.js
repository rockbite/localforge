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

  // Base path calculation
  const appBasePath = isDev ? path.join(__dirname, '..') : app.getAppPath();
  console.log(`App base path: ${appBasePath}`);

  // --- Calculate Server Script Path ---
  let serverScript;
  if (isDev) {
    serverScript = path.join(appBasePath, 'src', 'index.js');
  } else {
    // In packaged app, check for unpacked version first
    const unpackedScriptPath = path.join(appBasePath, '..', 'app.asar.unpacked', 'src', 'index.js');
    // Note: We go '../' from 'app' to get to 'Resources', then into 'app.asar.unpacked'
    
    if (fs.existsSync(unpackedScriptPath)) {
      serverScript = unpackedScriptPath;
      console.log('Using unpacked server script.');
    } else {
      // Fallback (though unlikely if unpackDir is used correctly)
      serverScript = path.join(appBasePath, 'src', 'index.js');
      console.warn('Using potentially ASAR-packed server script - this might fail!');
    }
  }
  
  console.log(`Resolved server script path: ${serverScript}`);
  console.log(`Server script exists: ${fs.existsSync(serverScript) ? 'Yes' : 'No'}`);

  if (!fs.existsSync(serverScript)) {
    console.error("FATAL: Server script not found at the calculated path!");
    return; // Don't attempt to start if script doesn't exist
  }

  // --- Determine Node Executable and Args ---
  const nodeExecutable = isDev ? 'node' : process.execPath; 
  const nodeArgs = [serverScript]; // Just pass the script path as the primary arg

  // --- Determine CWD ---
  // The CWD should be where the script can find its relative dependencies
  const serverCwd = isDev ? appBasePath : path.join(appBasePath, '..', 'app.asar.unpacked');
  console.log(`Setting server CWD to: ${serverCwd}`);

  console.log(`Attempting to start server with:`);
  console.log(` Executable: ${nodeExecutable}`);
  console.log(` Args: ${nodeArgs.join(' ')}`);
  console.log(` CWD: ${serverCwd}`);

  // --- Spawn the Process ---
  serverProcess = spawn(nodeExecutable, nodeArgs, {
    cwd: serverCwd,
    stdio: 'inherit', // Keep for debugging
    shell: isDev, // Only use shell in development
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    }
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server process:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(`Server process exited with code ${code} and signal ${signal}`);
  });

  // Kill server on main process exit
  app.on('quit', () => {
    if (serverProcess && !serverProcess.killed) {
      console.log('Main app quitting, killing server process.');
      serverProcess.kill();
    }
  });
  
  process.on('exit', () => {
    if (serverProcess && !serverProcess.killed) {
      console.log('Main process exiting, killing server process');
      serverProcess.kill();
    }
  });
  
  return serverProcess;
}