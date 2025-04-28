import { fsTools } from '../utils/fileSystemUtils.js';
const viewTool = fsTools.View;

export default {
  name: 'View',
  schema: {
    type: 'function',
    function: {
      name: 'View',
      description: "Reads a file from the local filesystem. You can access any file directly by using this tool.\nAssume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.\n\nUsage:\n- The file_path parameter must be an absolute path, not a relative path\n- By default, it reads up to 2000 lines starting from the beginning of the file\n- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters\n- Any lines longer than 2000 characters will be truncated\n- Results are returned using cat -n format, with line numbers starting at 1\n- This tool allows Claude Code to VIEW images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.\n- For Jupyter notebooks (.ipynb files), use the ReadNotebook instead\n- When reading multiple files, you MUST use the BatchTool tool to read them all at once",
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: 'The absolute path to the file to read'
          },
          offset: {
            type: 'number',
            description: 'The line number to start reading from. Only provide if the file is too large to read at once'
          },
          limit: {
            type: 'number',
            description: 'The number of lines to read. Only provide if the file is too large to read at once.'
          }
        },
        required: ['file_path'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => viewTool(args),
  getDescriptiveText: (args) => {
    const fileName = args.file_path.split('/').pop();
    const text = `Viewing ${fileName}`;
    return text;
  },
  ui: {
    icon: 'visibility',
    widgetTemplate: '<div><input name="file_path" placeholder="File Path"/><input name="offset" placeholder="Offset (optional)"/><input name="limit" placeholder="Limit (optional)"/></div>'
  }
};