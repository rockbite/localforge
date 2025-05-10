/**
 * src/services/accounting/index.js - Token and cost accounting for LLM interactions
 * Refactored to work with the ProjectSessionManager
 */

import { EventEmitter } from 'events';
import pricing from '../../config/pricing.js';

// This emitter is deprecated but maintained for backward compatibility
// New code should use sessionAccountingEvents from ProjectSessionManager
const accountingEvents = new EventEmitter();

/**
 * Add token usage to a session's accounting data and recalculate costs.
 * MUTATES the passed accounting object.
 * 
 * @param {Object} accountingObject - The accounting object to update { models: {}, totalUSD: 0 }
 * @param {string} model - LLM model name
 * @param {number} promptTokens - Number of input tokens
 * @param {number} completionTokens - Number of output tokens
 */
function addUsage(accountingObject, model, promptTokens, completionTokens) {
    if (!accountingObject) return;
    if (!accountingObject.models) accountingObject.models = {};

    const rec = accountingObject.models[model] ||
        (accountingObject.models[model] = { input: 0, output: 0 });

    rec.input += promptTokens;
    rec.output += completionTokens;

    // ---- calculate dollar cost ----
    accountingObject.totalUSD = Object
        .entries(accountingObject.models)
        .reduce((sum, [m, v]) => {
            const p = pricing[m] || { in: 0, out: 0 };
            return sum + v.input * p.in + v.output * p.out;
        }, 0);

    accountingObject.input  = (accountingObject.input  ?? 0) + promptTokens;
    accountingObject.output = (accountingObject.output ?? 0) + completionTokens;

    // Calculate total tokens
    const totalTokens = accountingObject.input + accountingObject.output;

    // NOTE: Event emission is now handled by ProjectSessionManager
    // The following is maintained for backward compatibility, but should
    // be removed when all code uses ProjectSessionManager
    if (accountingObject.__id) {
        accountingEvents.emit('updated', {
            sessionId: accountingObject.__id,
            totalUSD: accountingObject.totalUSD.toFixed(4),
            breakdown: accountingObject.models
        });

        // Also emit token count update
        accountingEvents.emit('token_count', {
            sessionId: accountingObject.__id,
            current: totalTokens,
            max: 1000000,
            accounting: {
                input: accountingObject.input,
                output: accountingObject.output
            }
        });
    }
}

export { addUsage, accountingEvents };