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

    // security – stay inside sandbox
    if (!abs.startsWith(workingDirectory)) {
        return { error: 'Access denied' };
    }

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
    if(!path.resolve(file_path).startsWith(workingDirectory)) return { error: 'Access denied' };
    const data = await fs.readFile(file_path, 'utf-8');
    return { contents: data.split('\n').slice(offset, offset+limit).join('\n') };
};

const edit = async ({ file_path, old_string, new_string, workingDirectory }) => {
    if(!path.resolve(file_path).startsWith(workingDirectory)) return { error: 'Access denied' };
    let data = await fs.readFile(file_path, 'utf-8');
    if(!data.includes(old_string)) return { error: 'Old string not found' };
    data = data.replace(old_string, new_string);
    await fs.writeFile(file_path, data);
    return { success: true };
};

const replace = async ({ file_path, content, workingDirectory }) => {
    if(!path.resolve(file_path).startsWith(workingDirectory)) return { error: 'Access denied' };
    await fs.writeFile(file_path, content);
    return { success: true };
};

const fsTools = { LS: ls, View: view, Edit: edit, Replace: replace };

export { fsTools };