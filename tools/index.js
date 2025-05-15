import path from 'path';
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
import {getFilteredToolList} from "../src/utils.js";
import BrowserClaim from "./list/browser/BrowserClaim.js";
import BrowserNavigate from "./list/browser/BrowserNavigate.js";
import BrowserInteract from "./list/browser/BrowserInteract.js";
import BrowserScreenshot from "./list/browser/BrowserScreenshot.js";
import mcpService from "../src/services/mcp/index.js";

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
  TaskTrackingTool,
  BrowserClaim, BrowserNavigate, BrowserInteract, BrowserScreenshot
];

const defaultAllow = [
  Bash.name,
  BatchTool.name,
  dispatch_agent.name,
  Edit.name,
  GlobTool.name,
  GrepTool.name,
  LS.name,
  Replace.name,
  View.name,
  WebFetchTool.name,
  ExpertAdviceTool.name,
  TaskTrackingTool.name,
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
    getSchemas: async (sessionData) => {
      return await getFilteredToolList(sessionData, allowedSchemas, defaultAllow);
    },
    async run(call, sessionData, signal = null) {
      let workingDirectory = sessionData.workingDirectory;
      const toolName = call.function.name;


      let mcpToolList = [];
      let mcpMap = {};
      // check for MCP tool list
      if(sessionData.mcpAlias) {
        const mcpToolList = await mcpService.listTools(sessionData.mcpAlias);
        mcpToolList.forEach(tool => {
          mcpMap[tool.function.name] = tool;
        });
      }

      if (!allowedToolNames.includes(toolName)) {
        // maybe its mcp?
        if(mcpMap[toolName]) {
          // executing MCP tool!
          return await mcpService.callTool(sessionData.mcpAlias, call, signal);
        } else {
          return {error: `Tool \"${toolName}\" is not available.`};
        }
      }
      const args = typeof call.function.arguments === 'string'
        ? JSON.parse(call.function.arguments)
        : call.function.arguments;

      sessionData.sessionId = this.sessionId;
        
      // Add sessionId to args if available in the registry
      const toolContext = {
        sessionId: this.sessionId
      };

      // this is a shit-code, but it will work for now, we should fix this machine generated shit later
      args.workingDirectory = workingDirectory;
      
      try {
        // For file system related tools, ensure workingDirectory is set if not specified
        if (['GrepTool', 'GlobTool', 'LS', 'View', 'Edit', 'Replace'].includes(toolName) && workingDirectory) {
          // Only set path if not already specified in args
          if (!args.path) {
            args.path = workingDirectory;
          }
        }
        
        if (toolName === 'dispatch_agent') {
          return await TOOL_IMPLEMENTATIONS[toolName]({...args, sessionData, workingDirectory, toolContext, signal});
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


          // Execute command with working directory, signal and sessionId for interruption support
          const result = await TOOL_IMPLEMENTATIONS[toolName]({
            ...args,
            workingDirectory,
            signal,
            sessionId: this.sessionId,
            sessionData
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
        return await TOOL_IMPLEMENTATIONS[toolName]({...args, sessionData, signal}, this);
      } catch (err) {
        return { error: err.message };
      }
    }
  };
}


export { 
  getAllToolNames, 
  createToolRegistry,
  TOOL_REGISTRY  // Export the tool registry for metadata access
};