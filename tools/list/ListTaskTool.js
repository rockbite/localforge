// ListTasksTool.js
/**
 * ListTasksTool – fetch the current task list (entire tree or a subtree).
 */
export default {
    name:'ListTasksTool',
    schema:{
        type:'function',
        function:{
            name:'ListTasksTool',
            description:`Return tasks as a tree (default) or flattened list.

* \`rootOnly = true\`  → only top-level tasks  
* \`parentId = "xyz"\` → return that sub-tree  
* \`flat = true\`      → return a flat array instead of nested children`,
            parameters:{
                type:'object',
                properties:{
                    flat:{type:'boolean',default:false},
                    rootOnly:{type:'boolean',default:false},
                    parentId:{type:'string'}
                },
                additionalProperties:false
            }
        }
    },

    execute:async(args,registry)=>{
        const res={success:false};
        try{
            const { projectSessionManager } =
                await import('../../src/services/sessions/index.js');
            if(!registry?.sessionId) throw new Error('SessionId missing');

            let tasks;
            if(args?.parentId){
                const subtree = await projectSessionManager.getSubTree(
                    registry.sessionId, args.parentId, { flat:!!args.flat }
                );
                if(!subtree) throw new Error('parentId not found');
                tasks=subtree;
            }else{
                tasks = await projectSessionManager.getTasks(
                    registry.sessionId,
                    { flat:!!args.flat, rootOnly:!!args.rootOnly }
                );
            }
            res.tasks = tasks;
            res.success = true;
        }catch(e){res.error=e.message;}
        return res;
    },

    getDescriptiveText:()=>`List tasks`,
    ui:{icon:'list'}
};
