// ../utils/bashExecutor.js
import { spawn } from 'child_process';

const DEFAULT_TIMEOUT_MS = 250_000;     // hard stop after 80 s
const GRACE_KILL_MS     = 5_000;       // SIGKILL if SIGTERM ignored
const MAX_OUTPUT        = 30_000;      // truncate long logs

function truncate(text) {
    return text.length > MAX_OUTPUT
        ? text.slice(0, MAX_OUTPUT) + '... [TRUNCATED]'
        : text;
}

async function executeBash(command, timeout = DEFAULT_TIMEOUT_MS, workingDirectory = null) {
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
            resolve(result);
        };

        // collect output (with truncation)
        child.stdout.on('data', (d) => { stdout += d; stdout = truncate(stdout); });
        child.stderr.on('data', (d) => { stderr += d; stderr = truncate(stderr); });

        // hard‑timeout
        const hardTimer = setTimeout(() => {
            try {                         // try to kill the whole group
                process.kill(-child.pid, 'SIGTERM');
            } catch (_) {
                try { child.kill('SIGTERM'); } catch (_) {}
            }

            // if SIGTERM ignored, SIGKILL after grace period
            setTimeout(() => {
                try { process.kill(-child.pid, 'SIGKILL'); } catch (_) {}
            }, GRACE_KILL_MS);

            finish({
                stdout,
                stderr,
                error: new Error(`Command timed out after ${timeout} ms`),
                success: false,
                timedOut: true
            });
        }, timeout);

        // normal exit
        child.on('close', (code) => {
            finish({
                stdout,
                stderr,
                error: code === 0 ? null : new Error(`Command exited with code ${code}`),
                success: code === 0,
                timedOut: false
            });
        });

        // spawn failure (e.g. command not found)
        child.on('error', (err) => {
            finish({
                stdout,
                stderr: stderr + `\nSpawn error: ${err.message}`,
                error: err,
                success: false,
                timedOut: false
            });
        });
    });
}

export { executeBash };