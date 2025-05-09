import {spawn} from "child_process";
import {app, shell} from "electron";

function runNpmInstallCommand() {
    const platform = process.platform;
    const UPDATE_NPM_CMD = `npm i -g @rockbite/localforge@latest`;   // or change to `npm i` for local installs

    if (platform === 'win32') {
        // Windows 10/11 – open new PowerShell window
        spawn('powershell.exe', [
            '-NoExit',
            '-Command',
            UPDATE_NPM_CMD,
        ], { detached: true, stdio: 'ignore' });

    } else if (platform === 'darwin') {
        // macOS – tell Terminal.app to run the command
        spawn('osascript', [
            '-e',
            `tell application "Terminal" to do script "${UPDATE_NPM_CMD.replace(/"/g, '\\"')}"`,
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
                spawn(term, ['-e', `${UPDATE_NPM_CMD} ; read -n 1 -s -r -p "Press any key to close…"`,
                ], { detached: true, stdio: 'ignore' });
                spawned = true;
                break;
            } catch { /* try next */ }
        }

        if (!spawned) {
            // last-ditch: run silently without a terminal
            spawn('sh', ['-c', UPDATE_NPM_CMD], { detached: true, stdio: 'ignore' });
        }
    }
}

function runDownloadCommand() {
    return new Promise((resolve, reject) => {
        const platform = process.platform;
        let assetName;
        let downloadUrl;

        const owner = 'rockbite';
        const repo = 'Localforge-arm64';

        // Determine the asset name and construct the download URL based on the OS
        if (platform === 'win32') {
            assetName = `${repo}-win32-x64.zip`; // As per your naming convention
            downloadUrl = `https://github.com/${owner}/${repo}/releases/latest/download/${assetName}`;

        } else if (platform === 'darwin') { // darwin is the identifier for macOS
            assetName = `${repo}.dmg`; // As per your naming convention
            downloadUrl = `https://github.com/${owner}/${repo}/releases/latest/download/${assetName}`;
        } else if (platform === 'linux') {
            downloadUrl = `https://github.com/rockbite/localforge/releases`;
        } else {
            return reject(new Error(`Unsupported platform: ${platform}`));
        }

        console.log(`URL: ${downloadUrl}`);

        // Use Electron's shell module to open the URL in the default browser
        shell.openExternal(downloadUrl)
            .then(() => {
                console.log(`Successfully requested to open URL: ${downloadUrl}`);
                resolve(downloadUrl); // Resolve the promise with the URL opened
            })
            .catch(err => {
                console.error(`Failed to open URL: ${downloadUrl}`, err);
                reject(new Error(`Failed to open external URL: ${err.message}`));
            });
    });
}

export function runUpdate() {
    let isNPMInstall = process["GLOBAL_NPM_INSTALL"];

    if(isNPMInstall) {
        // run npm command
        runNpmInstallCommand();
    } else {
        // download from github
        runDownloadCommand().then();
    }

    // Give the child a head start, then bail out
    setTimeout(() => app.exit(0), 500);
}