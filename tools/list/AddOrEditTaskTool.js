// AddOrEditTaskTool.js
/**
 * AddOrEditTaskTool – create an entire task tree **or** edit an existing task.
 *
 * Two mutually-exclusive actions:
 *  1. createTree – supply a nested JSON structure (no IDs needed at all).
 *  2. edit       – update title / description / status of an existing task.
 *
 * The tool always returns { success, tasks, error? } and, on success,
 * an idMap for freshly-created nodes so the agent can refer to them later.
 */
export default {
    name: 'AddOrEditTaskTool',
    schema: {
        type: 'function',
        function: {
            name: 'AddOrEditTaskTool',
            description: `Create new tasks (optionally nested) OR edit one existing task.

### Actions

**createTree**  
Send \`{action:"createTree", parentId?:"<existingTaskId or null>", tree:{...}}\`.  

\`createTree\` always inserts at root if NO parentId is provided.

The \`tree\` object may contain \`children\` recursively:

\`\`\`json
{
  "action":"createTree",
  "tree":{
    "title":"Build login feature",
    "description":"Epic for auth work",
    "children":[
      { "title":"Design DB schema" },
      { "title":"Implement /login endpoint" }
    ]
  }
}
\`\`\`

**edit**  
Send \`{action:"edit", id:"<taskId>", title?, description?, status?}\`.

### Returns
* \`success\`  – boolean
* \`tasks\`    – full updated task list (tree)
* \`idMap\`    – only on createTree; maps caller labels to real IDs
* \`error\`    – message on failure`,
            parameters: {
                type: 'object',
                properties: {
                    action: { type: 'string', enum: ['createTree', 'edit'] },
                    /* createTree props */
                    tree: {
                        type: 'object',
                        description: 'Root task node when action=createTree',
                        properties: {
                            title: { type: 'string' },
                            description: { type: 'string' },
                            children: { type: 'array', items: { $ref: '#/$defs/node' } }
                        },
                        required: ['title'],
                        additionalProperties: false
                    },
                    /* edit props */
                    id:         { type: 'string', description: 'Existing taskId (action=edit)' },
                    title:      { type: 'string' },
                    description:{ type: 'string' },
                    status:     { type: 'string', enum: ['pending','in-progress','completed','error'] },
                    parentId:   { type: [ 'string','null' ], description:'Attach root of new tree under this parent (createTree case, if not provided it will be added to root!!! pay attention) OR move task when action=edit' }
                },
                required: ['action'],
                additionalProperties: false,
                $defs:{
                    node:{
                        type:'object',
                        properties:{
                            title:{type:'string'},
                            description:{type:'string'},
                            children:{type:'array',items:{$ref:'#/$defs/node'}}
                        },
                        required:['title'],
                        additionalProperties:false
                    }
                }
            }
        }
    },

    execute: async (args, registry) => {
        const res = { success:false };
        try {
            const { projectSessionManager, TASK_STATUSES } =
                await import('../../src/services/sessions/index.js');
            if (!registry?.sessionId) throw new Error('SessionId missing');
            const sid = registry.sessionId;

            if (args.action === 'createTree') {
                if (!args.tree) throw new Error('tree required for createTree');

                const idMap = new Map();

                const rootParentId = ('parentId' in args) ? args.parentId || null : null;

                /** recursively create tasks */
                const walk = async (node, parentId=rootParentId) => {
                    const { title, description='', children=[] } = node;
                    const t = await projectSessionManager.addTask(
                        sid, { title, description }, parentId, false
                    );
                    idMap.set(node, t.id);          // remember by object ref
                    for (const child of children) await walk(child, t.id);
                };
                await walk(args.tree);
                res.idMap = Object.fromEntries(
                    [...idMap.entries()].map(([k,v])=>[k.title,v])
                );
            } else if (args.action === 'edit') {
                const { id, title, description, status, parentId } = args;
                if (!id) throw new Error('id required for edit');
                if (title || description)
                    await projectSessionManager.editTask(sid, id, { title, description }, false);
                if (parentId !== undefined) {
                    await projectSessionManager.moveTask(sid, id, parentId || null, false);
                }
                if (status) {
                    if (!Object.values(TASK_STATUSES).includes(status))
                        throw new Error('Invalid status');
                    await projectSessionManager.setTaskStatus(sid, id, status, false);
                }
            } else {
                throw new Error('Unknown action');
            }

            await projectSessionManager.saveSession(sid);

            res.tasks   = await projectSessionManager.getTasks(sid);
            res.success = true;
        } catch (e) {
            res.error = e.message;
        }
        return res;
    },

    getDescriptiveText: (a)=>`Add/edit task`,
    ui: { icon:'plus-circle' }
};
