/**
 * TaskTrackingTool – gives the LLM a very small, CLI‑like surface to manage the
 * per‑session task list.
 *
 * It exposes ONE string parameter: `command`.
 *
 * Supported commands (case‑insensitive):
 *   list
 *       → returns the current tasks array.
 *
 *   add <title> [| <description>]
 *       → creates a new task, returns the full list.
 *         The optional description is separated from the title with the first
 *         vertical bar character.  Example:
 *           add Implement API | We need CRUD endpoints for tasks
 *
 *   remove <taskId>
 *       → deletes the task by id.
 *
 *   status <taskId> <pending|in-progress|completed|error>
 *       → updates the task status.
 *
 *   edit <taskId> <title> [| <description>]
 *       → replaces title / description.
 *
 * The tool always returns JSON with at least these keys:
 *   success   boolean
 *   tasks     the updated task list (on success)
 *   error     string message (on failure)
 */

export default {
  name: 'TaskTrackingTool',
  schema: {
    type: 'function',
    function: {
      name: 'TaskTrackingTool',
      description: `Manage the persistent project task list for the current conversation.

Accepted command syntax (single string in the \\"command\\" property). You may chain **multiple commands** in one call by separating them with a newline or a semicolon.

Single‑command forms:
• list
• add <title> [| <description>]
• remove <taskId>
• status <taskId> <pending|in-progress|completed|error>
• edit <taskId> <title> [| <description>]

Example (newline‑separated):
add Setup DB | create schema
add Implement API
status 1234 in-progress
status 5678 error
list

The tool returns JSON {success, tasks, error?}. The \"tasks\" field is always included on success so the assistant can reason about subsequent steps.

IMPORTANT: Always call \"list\" first if you don't already know the task ids.`,
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The textual command to execute.'
          }
        },
        required: ['command'],
        additionalProperties: false
      }
    }
  },

  /**
   * @param {object} args expects {command:string}
   * @param {object} registry reference to the tool registry (holds sessionId)
   */
  execute: async (args, registry) => {
    const res = { success: false };

    if (!registry || !registry.sessionId) {
      res.error = 'TaskTrackingTool: Session context (sessionId) missing.';
      return res;
    }

    const { command } = args || {};
    if (!command || typeof command !== 'string') {
      res.error = 'TaskTrackingTool: "command" must be a non‑empty string.';
      return res;
    }

    // Import ProjectSessionManager from the new location
    const { projectSessionManager, TASK_STATUSES } = await import('../../src/services/sessions/index.js');

    const sessionId = registry.sessionId;

    // Support multiple commands by splitting on newline or semicolon at top level
    const cmdLines = command.split(/(?:\n|;)+/).map(l => l.trim()).filter(Boolean);
    const errors = [];
    let finalTasks = [];

    for (const line of cmdLines) {
      const tokens = line.trim().split(/\s+/);
      const primary = tokens.shift().toLowerCase();

      try {
        switch (primary) {
          case 'list': {
            finalTasks = await projectSessionManager.getTasks(sessionId);
            res.tasks = finalTasks;
            res.success = true;
            break;
          }

          case 'add': {
            const rest = line.slice(3).trim(); // remove 'add'
            if (!rest) throw new Error('ADD requires a title.');

            const [titlePartRaw, ...descParts] = rest.split('|');
            const titlePart = titlePartRaw.trim();
            const descPart = descParts.join('|').trim();
            
            const newTask = await projectSessionManager.addTask(sessionId, {
              title: titlePart,
              description: descPart || ''
            });
            
            finalTasks = await projectSessionManager.getTasks(sessionId);
            res.added = newTask;
            res.tasks = finalTasks;
            res.success = true;
            break;
          }

          case 'remove': {
            const taskId = tokens[0];
            if (!taskId) throw new Error('REMOVE requires a taskId');
            
            const ok = await projectSessionManager.removeTask(sessionId, taskId);
            if (!ok) throw new Error(`Task id not found: ${taskId}`);
            
            finalTasks = await projectSessionManager.getTasks(sessionId);
            res.tasks = finalTasks;
            res.success = true;
            break;
          }

          case 'status': {
            const taskId = tokens[0];
            const statusStr = tokens[1]?.toLowerCase();
            if (!taskId || !statusStr) {
              throw new Error('STATUS requires taskId and new status');
            }
            
            const valid = Object.values(TASK_STATUSES);
            if (!valid.includes(statusStr)) {
              throw new Error(`Invalid status. Allowed: ${valid.join(', ')}`);
            }
            
            const updated = await projectSessionManager.setTaskStatus(sessionId, taskId, statusStr);
            if (!updated) throw new Error(`Task id not found: ${taskId}`);
            
            finalTasks = await projectSessionManager.getTasks(sessionId);
            res.tasks = finalTasks;
            res.success = true;
            break;
          }

          case 'edit': {
            const taskId = tokens[0];
            if (!taskId) throw new Error('EDIT requires taskId and new title');
            
            const rest = line.slice(line.indexOf(taskId) + taskId.length).trim();
            if (!rest) throw new Error('EDIT requires new title or description');
            
            const [titleRaw, ...descPieces] = rest.split('|');
            const updated = await projectSessionManager.editTask(sessionId, taskId, {
              title: titleRaw ? titleRaw.trim() : undefined,
              description: descPieces.length ? descPieces.join('|').trim() : undefined
            });
            
            if (!updated) throw new Error(`Task id not found: ${taskId}`);
            
            finalTasks = await projectSessionManager.getTasks(sessionId);
            res.tasks = finalTasks;
            res.success = true;
            break;
          }

          default:
            throw new Error(`Unknown command: ${primary}`);
        }
      } catch (innerErr) {
        errors.push(`(${line}) -> ${innerErr.message}`);
        res.success = false;
      }
    }

    // Final result assembly
    if (errors.length > 0) {
      res.success = false;
      res.error = errors.join('; ');
      // Still include tasks if they were fetched
      if (finalTasks.length > 0) res.tasks = finalTasks;
      else res.tasks = await projectSessionManager.getTasks(sessionId);
    } else {
      res.success = true;
      // Ensure tasks are included if the last command wasn't 'list'
      if (!res.tasks) res.tasks = await projectSessionManager.getTasks(sessionId);
    }

    return res;
  },

  getDescriptiveText: (args) => {
    if (!args || !args.command) return 'Managing tasks';
    const cmd = args.command.split(/\s+/)[0];
    return `Task command: ${cmd}`;
  },

  ui: {
    icon: 'checklist'
  }
};