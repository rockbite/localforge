import {spawn} from "child_process";
import {app} from "electron";

const UPDATE_CMD = `npm i -g @rockbite/localforge@latest`;   // or change to `npm i` for local installs

export function runUpdate() {
    const platform = process.platform;

    if (platform === 'win32') {
        // Windows 10/11 – open new PowerShell window
        spawn('powershell.exe', [
            '-NoExit',
            '-Command',
            UPDATE_CMD,
        ], { detached: true, stdio: 'ignore' });

    } else if (platform === 'darwin') {
        // macOS – tell Terminal.app to run the command
        spawn('osascript', [
            '-e',
            `tell application "Terminal" to do script "${UPDATE_CMD.replace(/"/g, '\\"')}"`,
            '-e',
            'tell application "Terminal" to activate',
        ], { detached: true, stdio: 'ignore' });

    } else {
        // Linux – try the user’s default x-terminal-emulator, gnome-terminal, or xterm
        const terminals = [
            'x-terminal-emulator',
            'gnome-terminal',
            'konsole',
            'xterm',
        ];

        let spawned = false;
        for (const term of terminals) {
            try {
                spawn(term, ['-e', `${UPDATE_CMD} ; read -n 1 -s -r -p "Press any key to close…"`,
                ], { detached: true, stdio: 'ignore' });
                spawned = true;
                break;
            } catch { /* try next */ }
        }

        if (!spawned) {
            // last-ditch: run silently without a terminal
            spawn('sh', ['-c', UPDATE_CMD], { detached: true, stdio: 'ignore' });
        }
    }

    // Give the child a head start, then bail out
    setTimeout(() => app.exit(0), 500);
}