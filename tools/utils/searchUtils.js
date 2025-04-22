import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

// The working directory will be dynamically provided via the socket connection
let TOOL_ALLOWED_BASE = process.cwd();

async function globTool({ pattern, path: searchPath = process.cwd() }) {
    const basePath = searchPath || process.cwd();
    if(!path.resolve(basePath).startsWith(TOOL_ALLOWED_BASE)) {
        return { error: 'Access denied' };
    }
    
    try {
        const files = await glob(pattern, { 
            cwd: basePath,
            absolute: true,
            dot: true
        });
        
        // Sort files by modification time (most recent first)
        const fileStats = await Promise.all(
            files.map(async (file) => {
                try {
                    const stats = await fs.stat(file);
                    return { file, mtime: stats.mtime };
                } catch (error) {
                    return { file, mtime: new Date(0) };
                }
            })
        );
        
        fileStats.sort((a, b) => b.mtime - a.mtime);
        return { matches: fileStats.map(item => item.file) };
    } catch (error) {
        return { error: `Error in glob pattern: ${error.message}` };
    }
}

async function grepTool({ pattern, path: searchPath = process.cwd(), include = '*' }) {
    // Ensure searchPath is not undefined or null
    const basePath = searchPath || process.cwd();
    console.log(`[GrepTool] Searching with pattern "${pattern}", include: "${include}", path: "${basePath}"`);
    
    if(!path.resolve(basePath).startsWith(TOOL_ALLOWED_BASE)) {
        console.log(`[GrepTool] Access denied for path "${basePath}". TOOL_ALLOWED_BASE: "${TOOL_ALLOWED_BASE}"`);
        return { error: 'Access denied' };
    }
    
    try {
        // Ensure pattern is recursive if it doesn't already have a glob pattern
        let includePattern = include;
        if (!includePattern.includes('**/') && !includePattern.startsWith('*/') && !includePattern.startsWith('**')) {
            includePattern = `**/${includePattern}`;
        }
        
        console.log(`[GrepTool] Using glob pattern: "${includePattern}" in directory: "${basePath}"`);
        
        // First get all matching files based on include pattern
        const files = await glob(includePattern, { 
            cwd: basePath,
            absolute: true,
            dot: true // Include dotfiles
        });
        
        console.log(`[GrepTool] Found ${files.length} matching files for pattern "${includePattern}"`);
        if (files.length < 10) {
            // Log all files if there are fewer than 10
            console.log(`[GrepTool] Files found: ${JSON.stringify(files, null, 2)}`);
        }
        
        const regex = new RegExp(pattern, 'i'); // Case-insensitive matching
        const matches = [];
        
        // Search each file for the pattern
        for (const file of files) {
            try {
                const content = await fs.readFile(file, 'utf-8');
                if (regex.test(content)) {
                    const lines = content.split('\n');
                    const matchingLines = [];
                    
                    lines.forEach((line, index) => {
                        if (regex.test(line)) {
                            matchingLines.push({
                                line: index + 1,
                                content: line
                            });
                        }
                    });
                    
                    if (matchingLines.length > 0) {
                        matches.push({
                            file,
                            matches: matchingLines
                        });
                    }
                }
            } catch (error) {
                console.error(`Error reading file ${file}:`, error);
            }
        }
        
        // Sort files by modification time (most recent first)
        const fileStats = await Promise.all(
            matches.map(async (match) => {
                try {
                    const stats = await fs.stat(match.file);
                    return { ...match, mtime: stats.mtime };
                } catch (error) {
                    return { ...match, mtime: new Date(0) };
                }
            })
        );
        
        fileStats.sort((a, b) => b.mtime - a.mtime);
        
        // Limit number of files and lines for more manageable response size
        const MAX_FILES = 20;  // Max number of files to return
        const MAX_LINES_PER_FILE = 5;  // Max number of matching lines per file
        const MAX_LINE_LENGTH = 150;  // Max characters per line
        
        const trimmedResults = fileStats.slice(0, MAX_FILES).map(file => {
            // Count total matches before trimming
            const totalMatches = file.matches.length;
            
            // Trim lines to reasonable length and limit number of lines
            const trimmedMatches = file.matches.slice(0, MAX_LINES_PER_FILE).map(line => ({
                line: line.line,
                content: line.content.length > MAX_LINE_LENGTH 
                    ? line.content.substring(0, MAX_LINE_LENGTH) + '...' 
                    : line.content
            }));
            
            return {
                file: file.file,
                matches: trimmedMatches,
                matchCount: totalMatches,
                hasMoreMatches: totalMatches > MAX_LINES_PER_FILE
            };
        });
        
        // Include metadata about trimming
        const result = { 
            matches: trimmedResults,
            totalMatchingFiles: fileStats.length,
            hasMoreFiles: fileStats.length > MAX_FILES,
            isTrimmed: fileStats.length > MAX_FILES || fileStats.some(f => f.matches.length > MAX_LINES_PER_FILE)
        };
        
        return result;
    } catch (error) {
        return { error: `Error in grep pattern: ${error.message}` };
    }
}

/**
 * Sets the allowed base path for search tools
 * @param {string} basePath - Path to set as allowed base
 */
function setAllowedBasePath(basePath) {
    if (basePath && typeof basePath === 'string') {
        TOOL_ALLOWED_BASE = basePath;
        console.log(`Search tools base path set to: ${TOOL_ALLOWED_BASE}`);
    }
}

export { globTool, grepTool, setAllowedBasePath };