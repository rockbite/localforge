import { globTool } from '../utils/searchUtils.js';

export default {
  name: 'GlobTool',
  schema: {
    type: 'function',
    function: {
      name: 'GlobTool',
      description: "- Fast file pattern matching tool that works with any codebase size\n- Supports glob patterns like \"**/*.js\" or \"src/**/*.ts\"\n- Returns matching file paths sorted by modification time\n- Use this tool when you need to find files by name patterns\n- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead",
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'The glob pattern to match files against'
          },
          path: {
            type: 'string',
            description: 'The directory to search in. If not specified, the current working directory will be used. IMPORTANT: Omit this field to use the default directory. DO NOT enter "undefined" or "null" - simply omit it for the default behavior. Must be a valid directory path if provided.'
          }
        },
        required: ['pattern'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => globTool(args),
  getDescriptiveText: (args) => {
    const path = args.path ? ` in ${args.path}` : '';
    return `Finding files matching ${args.pattern}${path}`;
  },
  ui: {
    icon: 'find_in_page',
    widgetTemplate: '<div><input name="pattern" placeholder="Pattern"/><input name="path" placeholder="Directory (optional)"/></div>'
  }
};