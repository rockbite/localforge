// providers/index.js
import fs from 'node:fs';
import path from 'node:path';

const providers = {};

// Dynamically import everything in the folder
for (const file of fs.readdirSync(import.meta.dirname)) {
    if (!file.endsWith('.js') || file === 'index.js') continue;
    const mod = await import(path.join(import.meta.dirname, file));
    providers[mod.default.name] = mod.default;
}

export default providers;