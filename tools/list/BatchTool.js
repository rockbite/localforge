/**
 * Executes a batch of tool operations in parallel when possible
 * @param {Object} args - The batch args
 * @param {Function} runTool - Function to execute individual tools
 */
async function executeBatch(args, toolRegistry) {
  const { description, invocations, sessionId } = args;
  const runTool = typeof toolRegistry.run === 'function' ? toolRegistry.run.bind(toolRegistry) : toolRegistry;

  if (!Array.isArray(invocations) || invocations.length === 0) {
    return { error: 'Invalid invocations: must be a non-empty array' };
  }

  console.log(`Executing batch operation: ${description || 'unnamed'} with ${invocations.length} invocations`);

  try {
    // Process each tool invocation in parallel
    const results = await Promise.all(
        invocations.map(async (invocation) => {
          try {
            // Create a function call object
            const call = {
              function: {
                name: invocation.tool_name,
                arguments: invocation.arguments
              }
            };

            // Execute the tool
            return await runTool(call);
          } catch (error) {
            return {
              error: `Error executing tool ${invocation.tool_name}: ${error.message}`,
              tool: invocation.tool_name
            };
          }
        })
    );

    // Return the combined results
    return {
      description,
      results,
      count: results.length
    };
  } catch (error) {
    return { error: `Batch execution failed: ${error.message}` };
  }
}

export default {
  name: 'BatchTool',
  schema: {
    type: 'function',
    function: {
      name: 'BatchTool',
      description: "- Batch execution tool that runs multiple tool invocations in a single request\n " +
          "example json {\"description\":\"grep sockets\",\"invocations\":[{\"tool_name\":\"GrepTool\",\"arguments\":{\"pattern\":\"socket\",\"include\":\"*.js\"}}]}" +
          " (‼️ Every invocation MUST be an object {tool_name, arguments:{…}}. No other shape is valid.) \n - Tools are executed in parallel when possible, and otherwise serially\n- Takes a list of tool invocations \n- Returns the collected results from all invocations\n- Use this tool when you need to run multiple independent tool operations at once -- it is awesome for speeding up your workflow, reducing both context usage and latency\n- Each tool will respect its own permissions and validation rules",
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'A short (3-5 word) description of the batch operation'
          },
          invocations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tool_name: {
                  type: 'string',
                  description: 'The name of the tool to invoke'
                },
                arguments: {
                  type: 'object',
                  additionalProperties: {},
                  description: 'The arguments to pass to the tool'
                }
              },
              required: ['tool_name', 'arguments'],
              additionalProperties: false
            },
            description: 'The list of tool invocations to execute'
          }
        },
        required: ['description', 'invocations'],
        additionalProperties: false
      }
    }
  },
  execute: async (args, toolRegistry) => {
    if (!toolRegistry || typeof toolRegistry.run !== 'function') {
      return { error: 'BatchTool requires a valid tool registry' };
    }

    return await executeBatch(args, toolRegistry);
  },
  ui: {
    icon: 'playlist_play',
    widgetTemplate: '<div><input name="description" placeholder="Batch Description"/><textarea name="invocations" placeholder="Tool Invocations (JSON array)"/></div>'
  }
};