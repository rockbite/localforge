import { createToolRegistry } from '../index.js';
import { getEnvironmentInfo, getDirectoryStructure, runAgentLoop } from '../../src/services/agent/index.js';
import crypto from 'crypto';
import {MAIN_MODEL} from "../../src/index.js"; // Import crypto for generating a unique ID

// System prompt for sub-agent
const SUB_AGENT_SYSTEM_PROMPT = `You are a specialized sub-agent focused on searching and retrieving information from the provided context (like files and web content). You have a limited set of tools focused on reading and searching: View, GlobTool, GrepTool, LS, ReadNotebook, WebFetchTool. You CANNOT modify files or execute general commands. Your goal is to fulfill the request given in the user prompt, using only your available tools, and then return a single, comprehensive response summarizing your findings or the answer to the request. Be precise and directly answer the request based on the information you gather.`;

/**
 * Implementation for dispatch_agent
 * @param {Object} args - The arguments for the agent
 * @param {string} workingDirectory - Current working directory
 * @param {string} parentSessionId - The session ID of the parent agent calling this tool
 */
async function dispatchAgent(args, workingDirectory, parentSessionId = 'unknown_parent') {
  // Handle different input formats
  let prompt;
  
  // Parse arguments if they're a string
  if (typeof args === 'string') {
    try {
      const parsed = JSON.parse(args);
      prompt = parsed.prompt || args;
    } catch (e) {
      prompt = args;
    }
  } else if (args && typeof args === 'object') {
    prompt = args.prompt || JSON.stringify(args);
  } else {
    prompt = "No prompt provided";
  }
  
  // Generate a unique ID for this sub-agent invocation
  const subAgentSessionId = `sub_${parentSessionId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  
  console.log(`Dispatching sub-agent [${subAgentSessionId}] for prompt: "${prompt}"`);
  try {
    // Initialize an in-memory session for the sub-agent
    const { projectSessionManager } = await import('../../src/services/sessions/index.js');
    
    // Create a temporary in-memory session - this bypasses the database load
    projectSessionManager.resetSession(subAgentSessionId, {
      history: [], // Start with empty history
      tasks: [],
      accounting: { models: {}, totalUSD: 0 },
      workingDirectory: workingDirectory, // Pass through the working directory
      toolLogs: [],
      agentState: {
        status: 'thinking',
        statusText: 'Initializing sub-agent...',
        startTime: Date.now(),
        activeToolCallId: null
      }
    });
    
    // 1. Define allowed tools for the sub-agent
    const subAgentToolNames = ['View', 'GlobTool', 'GrepTool', 'LS', 'WebFetchTool'];

    // 2. Create the limited tool registry for the sub-agent
    const subAgentTools = createToolRegistry(subAgentToolNames);
    // Set the sessionId for the tools registry
    subAgentTools.sessionId = subAgentSessionId;

    // 3. Prepare environment info and directory structure for context
    const envInfo = await getEnvironmentInfo(workingDirectory);
    const dirStructure = await getDirectoryStructure(workingDirectory);

    // 4. Create initial messages for the sub-agent
    const initialMessages = [
      { role: 'system', content: `${SUB_AGENT_SYSTEM_PROMPT}\n\n${envInfo}\n${dirStructure}` },
      { role: 'user', content: prompt }
    ];

    // 5. Run the sub-agent loop without streaming
    console.log(`Calling runAgentLoop for sub-agent ${subAgentSessionId}`);
    const finalSubAgentMessage = await runAgentLoop(
      subAgentSessionId,  // sessionId (Argument 1)
      initialMessages,    // currentMessages (Argument 2)
      subAgentTools,      // agentTools (Argument 3)
      workingDirectory,   // workingDirectory (Argument 4)
      null                // streamCallback (Argument 5)
    );

    // 6. Return the sub-agent's response
    console.log(`Sub-agent [${subAgentSessionId}] finished.`);
    
    // Clean up the temporary session from memory
    if (projectSessionManager.activeSessions.has(subAgentSessionId)) {
      projectSessionManager.activeSessions.delete(subAgentSessionId);
      console.log(`Cleaned up temporary sub-agent session [${subAgentSessionId}]`);
    }
    
    return {
      subAgentResponse: finalSubAgentMessage.content || "Sub-agent did not provide content."
    };
  } catch (error) {
    console.error(`Error during sub-agent dispatch [${subAgentSessionId}]:`, error);
    
    // Clean up the temporary session from memory even if there was an error
    if (projectSessionManager && projectSessionManager.activeSessions && 
        projectSessionManager.activeSessions.has(subAgentSessionId)) {
      projectSessionManager.activeSessions.delete(subAgentSessionId);
      console.log(`Cleaned up temporary sub-agent session [${subAgentSessionId}] after error`);
    }
    
    return { error: `Sub-agent execution failed: ${error.message}${error.stack ? '\n' + error.stack : ''}` };
  }
}

export default {
  name: 'dispatch_agent',
  schema: {
    type: 'function',
    function: {
      name: 'dispatch_agent',
      description: "Launch a new agent that has access to the following tools: View, GlobTool, GrepTool, LS, ReadNotebook, WebFetchTool. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries, use the Agent tool to perform the search for you.\n\nWhen to use the Agent tool:\n- If you are searching for a keyword like \"config\" or \"logger\", or for questions like \"which file does X?\", the Agent tool is strongly recommended\n\nWhen NOT to use the Agent tool:\n- If you want to read a specific file path, use the View or GlobTool tool instead of the Agent tool, to find the match more quickly\n- If you are searching for a specific class definition like \"class Foo\", use the GlobTool tool instead, to find the match more quickly\n- If you are searching for code within a specific file or set of 2-3 files, use the View tool instead of the Agent tool, to find the match more quickly\n\nUsage notes:\n1. Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses\n2. When the agent is done, it will return a single message back to you. The result returned by the agent is not visible to the user. To show the user the result, you should send a text message back to the user with a concise summary of the result.\n3. Each agent invocation is stateless. You will not be able to send additional messages to the agent, nor will the agent be able to communicate with you outside of its final report. Therefore, your prompt should contain a highly detailed task description for the agent to perform autonomously and you should specify exactly what information the agent should return back to you in its final and only message to you.\n4. The agent's outputs should generally be trusted\n5. IMPORTANT: The agent can not use Bash, Replace, Edit, NotebookEditCell, so can not modify files. If you want to use these tools, use them directly instead of going through the agent.",
      parameters: {
        type: 'object',
        properties: {
          prompt: {
            type: 'string',
            description: 'The task for the agent to perform'
          }
        },
        required: ['prompt'],
        additionalProperties: false
      }
    }
  },
  execute: async (args, workingDirectory, toolContext) => {
    // Extract the parent sessionId from the toolContext if available
    const parentSessionId = toolContext?.sessionId || 'unknown_parent';
    return dispatchAgent(args, workingDirectory, parentSessionId);
  },
  ui: {
    icon: 'memory',
    widgetTemplate: '<div><textarea name="prompt" placeholder="Agent Prompt"/></div>'
  }
};