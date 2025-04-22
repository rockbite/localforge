/**
 * accounting.js - Token and cost accounting for LLM interactions
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

    // NOTE: Event emission is now handled by ProjectSessionManager
    // The following is maintained for backward compatibility, but should
    // be removed when all code uses ProjectSessionManager
    if (accountingObject.__id) {
        accountingEvents.emit('updated', {
            sessionId: accountingObject.__id,
            totalUSD: accountingObject.totalUSD.toFixed(4),
            breakdown: accountingObject.models
        });
    }
}

export { addUsage, accountingEvents };