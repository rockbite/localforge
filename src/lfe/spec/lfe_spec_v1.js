import { z } from 'zod';

/** ---  Shared primitives  --- */
const nonEmptyStr = () => z.string().min(1);

/** ---  Personality  --- */
const personalitySchema = z
    .object({
        role: z.enum(['main', 'expert', 'auxiliary']),
        provider: nonEmptyStr(),
        model: nonEmptyStr(),
    })
    .strict();

/** ---  Agent  --- */
const agentSchema = z
    .object({
        name: nonEmptyStr(),
        description: nonEmptyStr(),
        personalities: z.array(personalitySchema).optional(),
        tools: z.array(nonEmptyStr()).optional(),          // empty / omitted = all
        promptOverrides: z.record(z.string()).optional(),  // key-value map
    })
    .strict();

/** ---  MCP  --- */
const mcpSchema = z
    .object({
        name: nonEmptyStr(),
        arg: nonEmptyStr(), // URL or shell command string
    })
    .strict();

/** ---  Session (inside project-prefab)  --- */
const taskObjSchema = z
    .object({
        title: nonEmptyStr(),
        description: z.string().optional(),
        status: z.string().optional(),
    })
    .passthrough(); // allow extra custom task fields

const sessionSchema = z
    .object({
        name: nonEmptyStr(),
        mcp: nonEmptyStr(),
        agent: nonEmptyStr(),
        taskList: z.array(z.union([nonEmptyStr(), taskObjSchema])).optional(),
    })
    .strict();

/** ---  Project-prefab  --- */
const projectPrefabSchema = z
    .object({
        name: nonEmptyStr(),
        sessions: z.array(sessionSchema).min(1),
    })
    .strict();

/** ---  Discriminated union for each export block  --- */
const exportBlockSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('project-prefab'),
        data: projectPrefabSchema,
    }),
    z.object({
        type: z.literal('mcp'),
        data: mcpSchema,
    }),
    z.object({
        type: z.literal('agent'),
        data: agentSchema,
    }),
]).strict();

/** ------------------------------------------------------------------
 *  Top-level Localforge Export spec
 *  ------------------------------------------------------------------ */
export const lfe_spec_v1 = z
    .object({
        lfeVersion: z.literal('1.0.0'),
        exports: z.array(exportBlockSchema).min(1),
    })
    .strict();
