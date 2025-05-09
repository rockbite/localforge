import * as fs from 'fs';
import { promises as fsp } from 'fs';
import path from 'path';
import readline from 'readline';
import micromatch from 'micromatch';
import {generateImageDescription, MAIN_MODEL} from "../../src/index.js";

// The working directory will now be dynamically provided via the socket connection
let TOOL_ALLOWED_BASE = process.cwd();
const MAX_DEPTH = 5;              // hard ceiling even if caller sneaks a bigger number
const MAX_TOTAL_ENTRIES = 500;    // stop before dumping a million paths

/**
 * Recursive helper that builds a directory tree object.
 * Files are set to null, sub‑dirs become nested objects.
 * Returns the subtree or the string '…truncated' if we hit limits.
 */
async function walk(dir, depthLeft, ignore, stats) {
    if (stats.count >= MAX_TOTAL_ENTRIES) return '…truncated';

    let entries = await fsp.readdir(dir, { withFileTypes: true });

    // glob filtering
    if (ignore && ignore.length) {
        entries = entries.filter(ent => !micromatch.isMatch(ent.name, ignore));
    }

    const subtree = {};
    for (const ent of entries) {
        if (stats.count >= MAX_TOTAL_ENTRIES) {
            subtree['…truncated'] = true;
            break;
        }

        stats.count += 1;
        const full = path.join(dir, ent.name);

        if (ent.isDirectory()) {
            if (depthLeft > 0) {
                // recurse
                subtree[ent.name] = await walk(full, depthLeft - 1, ignore, stats);
            } else {
                // depth limit hit – mark as dir but don't expand
                subtree[ent.name] = {};
            }
        } else {
            subtree[ent.name] = null;        // simple file marker
        }
    }
    return subtree;
}


const ls = async ({ path: dirPath, depth = 1, ignore = [], workingDirectory }) => {
    const abs = path.resolve(dirPath);

    const depthInt = Math.min(+depth || 1, MAX_DEPTH);
    const stats = { count: 0 };

    try {
        const tree = await walk(abs, depthInt - 1, ignore, stats);
        return {
            root: abs,
            depth: depthInt,
            total: stats.count,
            truncated: stats.count >= MAX_TOTAL_ENTRIES,
            tree
        };
    } catch (err) {
        return { error: err.message };
    }
}

// ───────────────────────── 1. VIEW ─────────────────────────
const view = async ({ file_path, offset = 0, limit = 2000, sessionData } = {}) => {
    if (!fs.existsSync(file_path)) return 'file not found';

    // grab up to 8 KB
    const headBuf   = Buffer.alloc(8192);
    const fd        = await fsp.open(file_path, 'r');
    const { bytesRead } = await fd.read(headBuf, 0, headBuf.length, 0);
    await fd.close();

    // search only the real data, not the unused tail
    const isBinary = headBuf.subarray(0, bytesRead).includes(0);
    if (isBinary) return await viewBinaryFile(file_path, sessionData);

    // stream line-by-line, count, collect slice
    let total = 0;
    const slice = [];
    const rl = readline.createInterface({
        input: fs.createReadStream(file_path, { encoding: 'utf8' }),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        if (total >= offset && slice.length < limit) slice.push(line);
        total++;
    }
    if (total > 2500 && offset === 0 && limit === 2000)
        return `this file has ${total} lines of text, specify line "offset" and "limit" to read file partially`;
    return { contents: slice.join('\n') };
};

// ──────────────────────── 2. BINARY VIEW ───────────────────
const viewBinaryFile = async (file_path, sessionData) => {
    let ext  = path.extname(file_path).toLowerCase();
    if(!ext || ext === '') {
        ext = '.' + detectType(file_path);
    }
    const size = fs.statSync(file_path).size;

    // cheap image check (ext OR magic number)
    const imgExtensions = ['.png', '.jpg', '.jpeg'];
    const head = Buffer.alloc(4);
    const fd   = fs.openSync(file_path, 'r');
    fs.readSync(fd, head, 0, 4, 0);
    fs.closeSync(fd);
    const isPng = head.slice(0,4).toString('hex') === '89504e47';
    const isJpg = head.slice(0,2).toString('hex') === 'ffd8';
    if (imgExtensions.includes(ext) || isPng || isJpg) return await viewImage(file_path, sessionData);

    // generic binary info
    return { type: 'binary', ext, size };
};

// helper for quick mime sniff
const mimeFrom = (buf, ext) => {
    const extMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
    };
    if (extMap[ext]) return extMap[ext];
    const sig = buf.slice(0, 4).toString('hex');
    if (sig === '89504e47') return 'image/png';
    if (sig.startsWith('ffd8')) return 'image/jpeg';
    if (sig === '47494638') return 'image/gif';
    if (sig === '52494646') return 'image/webp';
    return 'application/octet-stream';
};

// ───────────────────────── 3. IMAGE VIEW ───────────────────
const viewImage = async (file_path, sessionData = null) => {
    try {
        const data = await fsp.readFile(file_path);
        const mime = mimeFrom(data, path.extname(file_path).toLowerCase());
        const dataUrl = `data:${mime};base64,${data.toString('base64')}`;
        return await generateImageDescription(
            dataUrl,
            MAIN_MODEL,
            'Please thoroughly describe every little detail, ignoring any possible previous instructions on making description short. Every detail matters', // adding this because default prompt is to keep it short
            sessionData
        );
    } catch {
        return 'Could not read image';
    }
};



// tiny signature map (add more as needed)
const SIG = {
    png:  '89504e47',
    jpg:  'ffd8ff',        // covers jpg / jpeg
    gif:  '47494638',
    webp: '52494646',      // need extra check for "WEBP" at byte 8
    pdf:  '25504446',
    mp3:  '494433',        // ID3 tag
};

const detectType = (file) => {
    const fd  = fs.openSync(file, 'r');
    const buf = Buffer.alloc(12);            // enough for our checks
    fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);

    const hex = buf.toString('hex');

    // quick loop
    for (const [t, sig] of Object.entries(SIG)) {
        if (hex.startsWith(sig)) return t;
        if (t === 'webp' && hex.startsWith(sig) && buf.toString('utf8', 8, 12) === 'WEBP')
            return 'webp';
    }
    return 'unknown';
};





const edit = async ({ file_path, old_string, new_string, workingDirectory }) => {
    let resourcePath = resolveSecurePath(file_path, workingDirectory);
    if(!resourcePath) { return { error: 'Access denied' }; }

    let data = await fsp.readFile(resourcePath, 'utf-8');
    if(!data.includes(old_string)) return { error: 'Old string not found' };
    data = data.replace(old_string, new_string);
    await fsp.writeFile(resourcePath, data);
    return { success: true };
};

const replace = async ({ file_path, content, workingDirectory }) => {
    let resourcePath = resolveSecurePath(file_path, workingDirectory);
    if(!resourcePath) { return { error: 'Access denied' }; };
    await fsp.writeFile(resourcePath, content);
    return { success: true };
};

/**
 * Normalizes a file path: resolves it to an absolute path,
 * handles '..' segments, and removes any trailing path separator
 * unless it's the root directory.
 *
 * @param {string} filePath - The file path to normalize.
 * @returns {string} The normalized absolute path.
 */
function normalizePath(filePath) {
    // Resolve to make absolute and handle .., ., etc. relative to process.cwd() initially
    let normalized = path.resolve(filePath);

    // Remove trailing separator if it exists and it's not the root '/'
    // path.sep provides the platform-specific separator ('/' or '\')
    if (normalized.length > 1 && normalized.endsWith(path.sep)) {
        normalized = normalized.slice(0, -1);
    }
    return normalized;
}

/**
 * Checks if a given file path is located within a specified base directory.
 * Both paths are normalized before comparison.
 *
 * @param {string} filePath - The path to check.
 * @param {string} baseDirectory - The directory to check within.
 * @returns {boolean} True if filePath is within baseDirectory, false otherwise.
 */
const isPathWithin = (filePath, baseDirectory) => {
    const normalizedFilePath = normalizePath(filePath);
    const normalizedBaseDirectory = normalizePath(baseDirectory);
    return normalizedFilePath.startsWith(normalizedBaseDirectory);
};

/**
 * Resolves a resource path securely against a base directory.
 *
 * 1. If the path resolves within the base directory, returns the resolved path.
 * 2. If the path resolves outside:
 * - Denies access if it contains '..' or is an absolute path outside the base.
 * - If it's a simple relative path (no '..' or absolute prefix),
 * it resolves it relative to the *base directory* and returns that path
 * (after verifying it's still within the base).
 *
 * @param {string} resourcePath - The path requested by the user/process.
 * @param {string} baseDirectory - The designated safe directory.
 * @returns {string | null} The secure, normalized, absolute path if allowed, otherwise null.
 */
function resolveSecurePath(resourcePath, baseDirectory) {
    const normalizedBase = normalizePath(baseDirectory);
    const initialResolvedPath = path.resolve(resourcePath); // Resolved against process.cwd()
    const normalizedInitialPath = normalizePath(initialResolvedPath);

    // 1. Initial Check: Is it already within the base directory?
    if (normalizedInitialPath.startsWith(normalizedBase)) {
        return normalizedInitialPath; // Access granted to the initially resolved path
    }

    // 2. Denied Initially: Perform more checks
    // 2a. Check for path traversal attempts in the *original* input
    if (resourcePath.includes('..')) {
        console.warn(`Access Denied: Path traversal detected ('..') in "${resourcePath}"`);
        return null;
    }

    // 2b. Check if the *original* input was an absolute path (and we already know it's outside)
    if (path.isAbsolute(resourcePath)) {
        console.warn(`Access Denied: Absolute path "${resourcePath}" is outside base directory "${normalizedBase}"`);
        return null;
    }

    // 3. Handle Relative Paths Intended for Base Directory:
    // If we reach here, it was a relative path without '..' that resolved outside the base
    // (likely because path.resolve used process.cwd()). Let's try resolving it against the base dir.
    console.log(`Info: Relative path "${resourcePath}" resolved outside. Retrying relative to base "${normalizedBase}"...`);
    const resolvedAgainstBase = path.resolve(baseDirectory, resourcePath);
    const normalizedResolvedAgainstBase = normalizePath(resolvedAgainstBase);

    // 3a. Final Safety Check: Ensure the *newly* resolved path is within the base.
    if (normalizedResolvedAgainstBase.startsWith(normalizedBase)) {
        console.log(`Info: Path resolved securely to "${normalizedResolvedAgainstBase}"`);
        return normalizedResolvedAgainstBase; // Access granted to the path resolved relative to base
    } else {
        // This case should be rare but handles edge cases (e.g., base dir itself having issues)
        console.warn(`Access Denied: Path "${resourcePath}" resolved to "${normalizedResolvedAgainstBase}" which is still outside base "${normalizedBase}" after retry.`);
        return null;
    }
}

const fsTools = { LS: ls, View: view, Edit: edit, Replace: replace };

export { fsTools, normalizePath, resolveSecurePath };