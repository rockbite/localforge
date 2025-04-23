// ../utils/bashExecutor.js
import { spawn } from 'child_process';
import { projectSessionManager } from '../../src/services/sessions/index.js';

const DEFAULT_TIMEOUT_MS = 250_000;     // hard stop after 80 s
const GRACE_KILL_MS     = 5_000;       // SIGKILL if SIGTERM ignored
const MAX_OUTPUT        = 30_000;      // truncate long logs
const INTERRUPTION_CHECK_MS = 250;      // Check interruption every 250ms

function truncate(text) {
    return text.length > MAX_OUTPUT
        ? text.slice(0, MAX_OUTPUT) + '... [TRUNCATED]'
        : text;
}

/**
 * Executes a bash command with support for timeout and interruption
 * @param {string} command - Command to execute
 * @param {number} timeout - Timeout in milliseconds
 * @param {string} workingDirectory - Directory to execute in
 * @param {AbortSignal} signal - AbortSignal for interruption
 * @param {string} sessionId - Session ID for interruption checking
 */
async function executeBash(command, timeout = DEFAULT_TIMEOUT_MS, workingDirectory = null, signal = null, sessionId = null) {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        let settled = false;

        // launch in its own process group so we can nuke the whole tree
        const spawnOptions = {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe']
        };
        
        if (workingDirectory) {
            spawnOptions.cwd = workingDirectory;
        }
        
        const child = spawn('bash', ['-c', command], spawnOptions);

        // helper to resolve once
        const finish = (result) => {
            if (settled) return;
            settled = true;
            clearTimeout(hardTimer);
            clearInterval(interruptionCheckInterval);
            resolve(result);
        };

        // collect output (with truncation)
        child.stdout.on('data', (d) => { stdout += d; stdout = truncate(stdout); });
        child.stderr.on('data', (d) => { stderr += d; stderr = truncate(stderr); });

        // Function to kill the process and clean up
        const killProcess = (reason) => {
            console.log(`Killing bash process (PID: ${child.pid}) due to: ${reason}`);
            try {
                // Try to kill the whole process group
                process.kill(-child.pid, 'SIGTERM');
            } catch (err) {
                console.error(`Error killing process group: ${err.message}`);
                try { 
                    child.kill('SIGTERM'); 
                } catch (_) {}
            }

            // If SIGTERM ignored, SIGKILL after grace period
            setTimeout(() => {
                try { 
                    process.kill(-child.pid, 'SIGKILL'); 
                } catch (_) {}
            }, GRACE_KILL_MS);

            finish({
                stdout,
                stderr,
                error: new Error(`Command ${reason}`),
                success: false,
                interrupted: reason === 'interrupted'
            });
        };

        // Set up interruption check interval if sessionId is provided
        const interruptionCheckInterval = sessionId ? 
            setInterval(() => {
                if (projectSessionManager.isInterruptionRequested(sessionId)) {
                    console.log(`[${sessionId}] Bash command interruption detected via session manager`);
                    killProcess('interrupted');
                }
            }, INTERRUPTION_CHECK_MS) : null;

        // Set up AbortSignal listener if provided
        if (signal) {
            if (signal.aborted) {
                // Already aborted, kill immediately
                killProcess('interrupted');
                return;
            }
            
            signal.addEventListener('abort', () => {
                console.log('Bash command interruption detected via AbortSignal');
                killProcess('interrupted');
            }, { once: true });
        }

        // hard‑timeout
        const hardTimer = setTimeout(() => {
            killProcess(`timed out after ${timeout} ms`);
        }, timeout);

        // normal exit
        child.on('close', (code) => {
            finish({
                stdout,
                stderr,
                error: code === 0 ? null : new Error(`Command exited with code ${code}`),
                success: code === 0,
                timedOut: false,
                interrupted: false
            });
        });

        // spawn failure (e.g. command not found)
        child.on('error', (err) => {
            finish({
                stdout,
                stderr: stderr + `\nSpawn error: ${err.message}`,
                error: err,
                success: false,
                timedOut: false,
                interrupted: false
            });
        });
    });
}

export { executeBash };