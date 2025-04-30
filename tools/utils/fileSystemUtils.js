import { promises as fs } from 'fs';
import path from 'path';
import micromatch from 'micromatch';

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

    let entries = await fs.readdir(dir, { withFileTypes: true });

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

const view = async ({ file_path, offset = 0, limit = 2000, workingDirectory }) => {
    const data = await fs.readFile(file_path, 'utf-8');
    return { contents: data.split('\n').slice(offset, offset+limit).join('\n') };
};

const edit = async ({ file_path, old_string, new_string, workingDirectory }) => {
    let resourcePath = resolveSecurePath(file_path, workingDirectory);
    if(!resourcePath) { return { error: 'Access denied' }; }

    let data = await fs.readFile(resourcePath, 'utf-8');
    if(!data.includes(old_string)) return { error: 'Old string not found' };
    data = data.replace(old_string, new_string);
    await fs.writeFile(resourcePath, data);
    return { success: true };
};

const replace = async ({ file_path, content, workingDirectory }) => {
    let resourcePath = resolveSecurePath(file_path, workingDirectory);
    if(!resourcePath) { return { error: 'Access denied' }; };
    await fs.writeFile(resourcePath, content);
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