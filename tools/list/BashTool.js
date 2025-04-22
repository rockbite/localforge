import { executeBash } from '../utils/bashExecutor.js';

export default {
  name: 'Bash',
  schema: {
    type: 'function',
    function: {
      name: 'Bash',
      description: "Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.\n\nBefore executing the command, please follow these steps:\n\n1. Directory Verification:\n   - If the command will create new directories or files, first use the LS tool to verify the parent directory exists and is the correct location\n   - For example, before running \"mkdir foo/bar\", first use LS to check that \"foo\" exists and is the intended parent directory\n\n2. Command Execution:\n   - After ensuring proper quoting, execute the command.\n   - Capture the output of the command.\n\nUsage notes:\n  - The command argument is required.\n  - You can specify an optional timeout in milliseconds (up to 600000ms / 10 minutes). If not specified, commands will timeout after 30 minutes.\n  - It is very helpful if you write a clear, concise description of what this command does in 5-10 words.\n  - If the output exceeds 30000 characters, output will be truncated before being returned to you.\n  - VERY IMPORTANT: You MUST avoid using search commands like `find` and `grep`. Instead use GrepTool, GlobTool, or dispatch_agent to search. You MUST avoid read tools like `cat`, `head`, `tail`, and `ls`, and use View and LS to read files.\n  - When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).\n  - Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of `cd`. You may use `cd` if the User explicitly requests it. Never run bash commands tha may never complete such as running a development server, because then your execution will halt, as you can only continue after bash command end.",
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute'
          },
          timeout: {
            type: 'number',
            description: 'Optional timeout in milliseconds (max 600000)'
          },
          description: {
            type: 'string',
            description: 'Clear, concise description of what this command does in 5-10 words.'
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    }
  },
  execute: async ({ command, timeout, description, workingDirectory }) => {
    return await executeBash(command, timeout, workingDirectory);
  },
  getDescriptiveText: (args) => {
    // If description is provided, use it
    if (args.description) {
      return args.description;
    }
    
    // Otherwise use the command (truncated if too long)
    let cmd = args.command;
    if (cmd.length > 40) {
      cmd = cmd.substring(0, 37) + '...';
    }
    return `Running: ${cmd}`;
  },
  ui: {
    icon: 'terminal',
    widgetTemplate: '<div><input name="command" placeholder="Command"/><input name="timeout" placeholder="Timeout (ms)"/><input name="description" placeholder="Description"/></div>'
  }
};