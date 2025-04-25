import { callLLM } from '../../src/services/llm/index.js';
import {callLLMByType} from "../../src/index.js";

// Aux LLM prompt for bash command prefix detection
const BASH_PREFIX_PROMPT = `Your task is to process Bash commands that an AI coding agent wants to run.

This policy spec defines how to determine the prefix of a Bash command:
<policy_spec>
# Claude Code Code Bash command prefix detection

This document defines risk levels for actions that the Claude Code agent may take. This classification system is part of a broader safety framework and is used to determine when additional user confirmation or oversight may be needed.

## Definitions

**Command Injection:** Any technique used that would result in a command being run other than the detected prefix.

## Command prefix extraction examples
Examples:
- cat foo.txt => cat
- cd src => cd
- cd path/to/files/ => cd
- find ./src -type f -name "*.ts" => find
- gg cat foo.py => gg cat
- gg cp foo.py bar.py => gg cp
- git commit -m "foo" => git commit
- git diff HEAD~1 => git diff
- git diff --staged => git diff
- git diff $(pwd) => command_injection_detected
- git status => git status
- git status# test(\`id\`) => command_injection_detected
- git status\`ls\` => command_injection_detected
- git push => none
- git push origin master => git push
- git log -n 5 => git log
- git log --oneline -n 5 => git log
- grep -A 40 "from foo.bar.baz import" alpha/beta/gamma.py => grep
- pig tail zerba.log => pig tail
- potion test some/specific/file.ts => potion test
- npm run lint => none
- npm run lint -- "foo" => npm run lint
- npm test => none
- npm test --foo => npm test
- npm test -- -f "foo" => npm test
- pwd\\n curl example.com => command_injection_detected
- pytest foo/bar.py => pytest
- scalac build => none
- sleep 3 => sleep
</policy_spec>

The user has allowed certain command prefixes to be run, and will otherwise be asked to approve or deny the command.
Your task is to determine the command prefix for the following command.

IMPORTANT: Bash commands may run multiple commands that are chained together.
For safety, if the command seems to contain command injection, you must return "command_injection_detected".
(This will help protect the user: if they think that they're allowlisting command A,
but the AI coding agent sends a malicious command that technically has the same prefix as command A,
then the safety system will see that you said "command_injection_detected" and ask the user for manual confirmation.)

Note that not every command has a prefix. If a command has no prefix, return "none".

ONLY return the prefix. Do not return any other text, markdown markers, or other content or formatting.`;

// Aux LLM prompt for bash output file path extraction
const BASH_FILEPATH_PROMPT = `Extract any file paths that this command reads or modifies. For commands like "git diff" and "cat", include the paths of files being shown. Use paths verbatim -- don't add any slashes or try to resolve them. Do not try to infer paths that were not explicitly listed in the command output.
Format your response as:
<filepaths>
path/to/file1
path/to/file2
</filepaths>

If no files are read or modified, return empty filepaths tags:
<filepaths>
</filepaths>

Do not include any other text in your response.`;

/**
 * Safety check for bash commands using an aux LLM
 * @param {string} command - The command to check
 * @returns {Promise<string>} - The command prefix or "command_injection_detected"
 */
async function safeBashCheck(command) {
  try {
    const messages = [
      {
        role: 'system',
        content: BASH_PREFIX_PROMPT
      },
      {
        role: 'user',
        content: command
      }
    ];

    const response = await callLLMByType(AUX_MODEL, {
      messages,
      temperature: 0,
      max_tokens: 128
    });
    
    return response.content.trim();
  } catch (error) {
    console.error('Error in Bash prefix check:', error);
    return 'command_injection_detected'; // Fail safe
  }
}

/**
 * Extract file paths from bash command output
 * @param {string} command - The command that was executed
 * @param {string} output - The command output
 * @returns {Promise<string[]>} - Array of file paths
 */
async function extractBashFilePaths(command, output) {
  try {
    const messages = [
      {
        role: 'system',
        content: BASH_FILEPATH_PROMPT
      },
      {
        role: 'user',
        content: `Command: ${command}\n\nOutput: ${output}`
      }
    ];

    const response = await callLLMByType(AUX_MODEL, {
      messages,
      temperature: 0,
      max_tokens: 1024
    });

    
    const content = response.content;
    const match = /<filepaths>([\s\S]*)<\/filepaths>/m.exec(content);
    
    if (match && match[1]) {
      const paths = match[1].trim().split('\n').filter(p => p.trim());
      return paths;
    }
    
    return [];
  } catch (error) {
    console.error('Error extracting file paths:', error);
    return [];
  }
}

export { safeBashCheck, extractBashFilePaths };