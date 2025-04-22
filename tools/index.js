import path from 'path';
// Base path setters and tool imports for a manual registry
import { setAllowedBasePath } from './utils/fileSystemUtils.js';
import { setAllowedBasePath as setSearchBasePath } from './utils/searchUtils.js';
import Bash from './list/BashTool.js';
import BatchTool from './list/BatchTool.js';
import dispatch_agent from './list/DispatchAgentTool.js';
import Edit from './list/EditTool.js';
import GlobTool from './list/GlobTool.js';
import GrepTool from './list/GrepTool.js';
import LS from './list/LSTool.js';
import Replace from './list/ReplaceTool.js';
import View from './list/ViewTool.js';
import WebFetchTool from './list/WebFetchTool.js';
import ExpertAdviceTool from './list/ExpertAdviceTool.js';
import TaskTrackingTool from './list/TaskTrackingTool.js';

// Explicit list of all tools
const tools = [
  Bash,
  BatchTool,
  dispatch_agent,
  Edit,
  GlobTool,
  GrepTool,
  LS,
  Replace,
  View,
  WebFetchTool,
  ExpertAdviceTool,
  TaskTrackingTool
];

// Map of tool name to its execute function
const TOOL_IMPLEMENTATIONS = Object.fromEntries(
  tools.map(t => [t.name, t.execute])
);

// Map of tool name to its full implementation (for metadata access)
const TOOL_REGISTRY = Object.fromEntries(
  tools.map(t => [t.name, t])
);

/**
 * Get all registered tool names
 */
function getAllToolNames() {
  return Object.keys(TOOL_IMPLEMENTATIONS);
}

/**
 * Create a registry for a subset of tools
 * @param {string[]} allowedToolNames
 */
function createToolRegistry(allowedToolNames) {
  // Use each tool's full schema (type + function) for function calling
  const allowedSchemas = tools
    .filter(t => allowedToolNames.includes(t.name))
    .map(t => t.schema);
  return {
    getSchemas: () => allowedSchemas,
    async run(call, workingDirectory) {
      const toolName = call.function.name;
      if (!allowedToolNames.includes(toolName)) {
        return { error: `Tool \"${toolName}\" is not available.` };
      }
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;
        
      // Add sessionId to args if available in the registry
      const toolContext = {
        sessionId: this.sessionId
      };
      
      try {
        // For file system related tools, ensure workingDirectory is set if not specified
        if (['GrepTool', 'GlobTool', 'LS', 'View', 'Edit', 'Replace'].includes(toolName) && workingDirectory) {
          // Only set path if not already specified in args
          if (!args.path) {
            args.path = workingDirectory;
          }
        }
        
        if (toolName === 'dispatch_agent') {
          return await TOOL_IMPLEMENTATIONS[toolName](args, workingDirectory, toolContext);
        }
        // Handle Bash command special cases
        if (toolName === 'Bash') {
          const { safeBashCheck, extractBashFilePaths } = await import('./utils/bashSecurity.js');
          // Perform safety check first
          const risk = await safeBashCheck(args.command);
          /*
          if (risk === 'command_injection_detected') {
            console.error(`Bash command blocked for safety: ${args.command}`);
            return {
              error: 'Command blocked for security reasons. Possible command injection detected.',
              command: args.command,
              success: false
            };
          }*/
          
          // Execute command with working directory
          const result = await TOOL_IMPLEMENTATIONS[toolName]({
            ...args,
            workingDirectory
          });
          
          // Extract file paths if successful
          if (result.success && result.stdout) {
            const paths = await extractBashFilePaths(args.command, result.stdout);
            if (paths.length > 0) {
              result.extractedFilePaths = paths;
            }
          }
          
          return result;
        }
        // Pass registry for tools that need nested calls (e.g. BatchTool)
        return await TOOL_IMPLEMENTATIONS[toolName](args, this);
      } catch (err) {
        return { error: err.message };
      }
    }
  };
}

/**
 * Set the working directory for tools (FS and search)
 * @param {string} directory
 */
function setWorkingDirectory(directory) {
  if (!directory) {
    // Handle null/undefined directory case
    setAllowedBasePath(process.cwd());
    setSearchBasePath(process.cwd());
    return true;
  }
  
  try {
    const resolved = path.resolve(directory);
    setAllowedBasePath(resolved);
    setSearchBasePath(resolved);
    process.chdir(resolved);
    return true;
  } catch {
    return false;
  }
}

export { 
  getAllToolNames, 
  createToolRegistry, 
  setWorkingDirectory,
  TOOL_REGISTRY  // Export the tool registry for metadata access
};