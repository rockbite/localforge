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
    serverScript = path.join(appBasePath, 'src', 'index.js'); // Assuming server entry is src/index.js in dev
  } else {
    serverScript = path.join(appBasePath, 'src', 'index.js'); // Adjust 'src/index.js' if needed
    console.log('Using ASAR-packed server script.');
  }

  console.log(`Resolved server script path: ${serverScript}`);
  // fs.existsSync might not work reliably for ASAR paths, but should for unpacked
  if (!isDev && !fs.existsSync(serverScript)) {
    console.warn(`Warning: fs.existsSync returned false for unpacked script path, proceeding anyway.`);
  }


  // --- Determine Node Executable and Args ---
  // Use process.execPath (the Electron executable) in packaged app
  const nodeExecutable = isDev ? 'node' : process.execPath;
  const nodeArgs = [serverScript]; // Pass the script to be run

  // --- Determine CWD ---
  // Let Node.js determine the CWD based on the script location in packaged mode.
  // Setting it explicitly can interfere with module resolution (especially with ASAR).
  const serverCwd = isDev ? appBasePath : undefined; // Use project root in dev, undefined in packaged
  console.log(`Setting server CWD to: ${serverCwd ?? 'default (undefined)'}`);

  console.log(`Attempting to start server with:`);
  console.log(` Executable: ${nodeExecutable}`);
  console.log(` Args: ${nodeArgs.join(' ')}`);
  console.log(` CWD: ${serverCwd ?? 'default (undefined)'}`);

  // --- Spawn the Process ---
  try {
    serverProcess = spawn(nodeExecutable, nodeArgs, {
      cwd: serverCwd, // Use calculated CWD
      stdio: 'inherit', // Show server's console output in Electron's console
      shell: isDev, // Use shell conveniences only in dev
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1', // Essential for running node script via Electron executable
        // NODE_ENV: isDev ? 'development' : 'production', // Good practice to set NODE_ENV
      }
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server process:', err);
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`Server process exited with code ${code} and signal ${signal}`);
      // Optionally add retry logic here if needed
    });

  } catch (error) {
    console.error("Error during server spawn:", error);
    return; // Stop if spawn fails immediately
  }


  // --- Cleanup ---
  const cleanup = () => {
    if (serverProcess && !serverProcess.killed) {
      console.log('Terminating server process...');
      serverProcess.kill();
    }
  };

  app.on('quit', cleanup);
  process.on('exit', cleanup); // Ensure cleanup on various exit scenarios

  return serverProcess;
}