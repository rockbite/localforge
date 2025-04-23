import { fsTools } from '../utils/fileSystemUtils.js';
const editTool = fsTools.Edit;

export default {
  name: 'PatchFile',
  schema: {
    type: 'function',
    function: {
      name: 'PatchFile',
      description: "This is a tool for patching/editing files. For moving or renaming files, you should generally use the Bash tool with the 'mv' command instead. For larger edits, use the Write tool to overwrite files.\n\nBefore using this tool:\n\n1. Use the View tool to understand the file's contents and context\n\n2. Verify the directory path is correct (only applicable when creating new files):\n   - Use the LS tool to verify the parent directory exists and is the correct location\n\nTo make a file edit, provide the following:\n1. file_path: The absolute path to the file to modify (must be absolute, not relative)\n2. old_string: The text to replace (must match the file contents exactly, including all whitespace and indentation)\n3. new_string: The edited text to replace the old_string\n4. expected_replacements: The number of replacements you expect to make. Defaults to 1 if not specified.\n\nBy default, the tool will replace ONE occurrence of old_string with new_string in the specified file. If you want to replace multiple occurrences, provide the expected_replacements parameter with the exact number of occurrences you expect.",
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to modify'
          },
          old_string: {
            type: 'string',
            description: 'The text to replace'
          },
          new_string: {
            type: 'string',
            description: 'The text to replace it with'
          },
          expected_replacements: {
            type: 'number',
            default: 1,
            description: 'The expected number of replacements to perform. Defaults to 1 if not specified.'
          },
          description: {
            type: 'string',
            description: 'Short description (5‑10 words) of what this edit does.'
          }
        },
        required: ['file_path', 'old_string', 'new_string'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => editTool(args),
  getDescriptiveText: (args) => {
    // If model supplied description, use it directly
    if (args.description && args.description.trim().length > 0) {
      return args.description.trim();
    }

    // Legacy fallback logic
    if (args.old_string === '') {
      return `Creating new file: ${args.file_path}`;
    }
    
    const replacements = args.expected_replacements && args.expected_replacements > 1 ? 
      `(${args.expected_replacements} replacements)` : '';
    
    return `Editing file: ${args.file_path} ${replacements}`;
  },
  ui: {
    icon: 'edit',
    widgetTemplate: '<div><input name="file_path" placeholder="File Path"/><input name="old_string" placeholder="Old String"/><input name="new_string" placeholder="New String"/><input name="expected_replacements" placeholder="Expected Replacements (optional)"/><input name="description" placeholder="Description (optional)"/></div>'
  }
};