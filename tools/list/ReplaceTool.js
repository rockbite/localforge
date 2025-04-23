import { fsTools } from '../utils/fileSystemUtils.js';
const replaceFn = fsTools.Replace;

export default {
  name: 'OverwriteFile',
  schema: {
    type: 'function',
    function: {
      name: 'OverwriteFile',
      description: "Write a file to the local filesystem as new. WARNING: This tool COMPLETELY OVERWRITES the entire content of a file if it existed, It DELETES the existing content and replaces it with the new content.\n\nBefore using this tool:\n\n1. Use the ReadFile tool to understand the file's contents and context\n\n2. Directory Verification (only applicable when creating new files):\n   - Use the LS tool to verify the parent directory exists and is the correct location",
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to write (must be absolute, not relative). If the file exists, its entire content will be replaced.'
          },
          content: {
            type: 'string',
            description: 'The content to write to the file'
          },
          description: {
            type: 'string',
            description: 'Short description (5‑10 words) of what change this write achieves.'
          }
        },
        required: ['file_path', 'content'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => replaceFn(args),
  getDescriptiveText: (args) => {
    // Prefer the user‑supplied description if provided
    if (args.description && args.description.trim().length > 0) {
      return args.description.trim();
    }

    // Fallback – mention file being overwritten (truncate path for length)
    const fp = args.file_path || '';
    const shown = fp.length > 50 ? '…' + fp.slice(-47) : fp;
    return `Writing file: ${shown}`;
  },
  ui: {
    icon: 'description',
    widgetTemplate: '<div><input name="file_path" placeholder="File Path"/><textarea name="content" placeholder="Content"/><input name="description" placeholder="Description (optional)"/></div>'
  }
};