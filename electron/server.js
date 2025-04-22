import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function startServer() {
  // Start the server from the project root
  const serverProcess = spawn('npm', ['run', 'server'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
    shell: true
  });
  
  serverProcess.on('error', (err) => {
    console.error('Failed to start server:', err);
  });
  
  process.on('exit', () => {
    serverProcess.kill();
  });
  
  return serverProcess;
}