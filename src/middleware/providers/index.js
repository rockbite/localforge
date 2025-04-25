// providers/index.js
import { readdirSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url); // -> /…/providers/index.js
const __dirname  = dirname(__filename);            // -> /…/providers

const providers = {};

for (const file of readdirSync(__dirname)) {
    if (file === 'index.js' || extname(file) !== '.js') continue;

    // Convert back to a file:// URL so dynamic import always works
    const url = pathToFileURL(join(__dirname, file)).href;
    const { default: provider } = await import(url);   // supports CJS + ESM

    if (!provider?.name) {
        console.warn(`provider ${file} is missing "name" property`);
        continue;
    }
    providers[provider.name] = provider;
}



export default providers;