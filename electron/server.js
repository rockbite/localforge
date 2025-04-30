import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { app, utilityProcess } from 'electron';
import {createWindow} from "./main.js";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * This method spawns a process to start the src/index.js which is the actual express server
 */
export function startServer() {
  const isDev = !app.isPackaged;



  // --- Spawn the Process ---
  /*
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
  }*/

  try {
    const scriptPath = path.join(__dirname, '../src/server/index.js');
    let serverProcess = utilityProcess.fork(scriptPath, [], {
      stdio: 'pipe', // Pipe stdout/stderr to main process console
      // serviceName: 'my-express-server' // Optional service name
    });

    serverProcess.stdout.on('data', (data) => {
      console.log(`[Server Process stdout]: ${data.toString()}`);
      // You can parse this output to get the port number if needed
      // Example: Check for a specific line like "Server listening on port XXXX"
      const match = data.toString().match(/Agent backend server listening on port (\d+)/);
      if (match && match[1]) {
        global.serverPort = parseInt(match[1], 10);
        createWindow();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Process stderr]: ${data.toString()}`);
    });

    serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code: ${code}`);
      serverProcess = null;
      // Handle unexpected exit - maybe try restarting or quit the app
      if (code !== 0) {
        console.error("Server process crashed!");
        // Optionally show an error to the user and quit
        // dialog.showErrorBox(...)
        // app.quit();
      }
    });


  } catch (error) {
    console.error('Failed to fork utility process:', error);
    // Handle error - quit app or show dialog
    app.quit();
    return;
  }


  app.on('quit', () => {
      // todo: add if needed

  });


  process.on('exit', () => {
    // todo: add if needed


  });

}