// RemoveTaskTool.js
/**
 * RemoveTaskTool – delete a task (and all its descendants) by ID.
 */
export default {
    name: 'RemoveTaskTool',
    schema: {
        type: 'function',
        function: {
            name: 'RemoveTaskTool',
            description: `Remove one task. All children are removed automatically.

Send:
\`\`\`json
{ "taskId":"abc123" }
\`\`\`

Returns { success, tasks, error? }`,
            parameters: {
                type: 'object',
                properties: {
                    taskId:{ type:'string', description:'ID of task to delete' }
                },
                required:['taskId'],
                additionalProperties:false
            }
        }
    },

    execute: async (args, registry)=>{
        const res={success:false};
        try{
            const { projectSessionManager } =
                await import('../../src/services/sessions/index.js');
            if(!registry?.sessionId) throw new Error('SessionId missing');
            if(!args.taskId) throw new Error('taskId required');

            const ok = await projectSessionManager.removeTask(registry.sessionId, args.taskId);
            if(!ok) throw new Error('Task not found');

            res.tasks   = await projectSessionManager.getTasks(registry.sessionId);
            res.success = true;
        }catch(e){ res.error=e.message; }
        return res;
    },

    getDescriptiveText:(a)=>`Remove task ${a?.taskId||''}`,
    ui:{icon:'trash'}
};
