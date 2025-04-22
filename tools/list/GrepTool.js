import { grepTool } from '../utils/searchUtils.js';

export default {
  name: 'GrepTool',
  schema: {
    type: 'function',
    function: {
      name: 'GrepTool',
      description: "- Fast content search tool that works with any codebase size\n- Searches file contents using regular expressions (case-insensitive)\n- Supports full regex syntax (eg. \"log.*Error\", \"function\\s+\\w+\", etc.)\n- Filter files by pattern with the include parameter (eg. \"*.js\", \"*.{ts,tsx}\")\n- Automatically searches recursively through subdirectories\n- Returns matching file paths sorted by modification time\n- Use this tool when you need to find files containing specific patterns\n- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead",
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The regular expression pattern to search for in file contents'
          },
          path: {
            type: 'string',
            description: 'The directory to search in. Defaults to the current working directory.'
          },
          include: {
            type: 'string',
            description: 'File pattern to include in the search (e.g. "*.js", "*.{ts,tsx}")'
          }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => grepTool(args),
  getDescriptiveText: (args) => {
    let text = `Searching for pattern "${args.pattern}"`;
    
    if (args.path) {
      text += ` in ${args.path}`;
    }
    
    if (args.include) {
      text += ` (files: ${args.include})`;
    }
    
    return text;
  },
  ui: {
    icon: 'search',
    widgetTemplate: '<div><input name="pattern" placeholder="Pattern"/><input name="path" placeholder="Directory (optional)"/><input name="include" placeholder="Include (optional)"/></div>'
  }
};