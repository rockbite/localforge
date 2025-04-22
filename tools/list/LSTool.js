// tools/LS.js
import { fsTools } from '../utils/fileSystemUtils.js';
const LSTool = fsTools.LS;          // we'll call the new logic below

export default {
  name: 'LS',
  schema: {
    type: 'function',
    function: {
      name: 'LS',
      description:
          'Recursively lists files/directories in `path` (must be absolute). ' +
          '`depth` limits recursion (default 1, max 5).' +
          'Use `ignore` for glob patterns you want skipped. ' +
          'You should generally prefer the Glob and Grep tools, if you know which directories to search. But you should always use this when trying to get to know existing codes or folder structure you never saw' +
          'Response: json tree, each element null→file, {}→dir, {…}→ dir+children ',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Absolute path to the directory to list'
          },
          depth: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            default: 1,
            description: 'How many directory levels to descend (1 = no recursion)'
          },
          ignore: {
            type: 'array',
            items: { type: 'string' },
            description: 'Glob patterns to ignore (e.g. ["**/*.log", "node_modules/**"])'
          }
        },
        required: ['path'],
        additionalProperties: false
      }
    }
  },

  // our new, beefier impl lives in fsTools.LS
  execute: async (args) => LSTool(args),

  getDescriptiveText: (args) =>
      `Listing contents of ${args.path} (depth ${args.depth ?? 1})`,

  ui: {
    icon: 'folder_open'
  }
};