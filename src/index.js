// Main entry point for the application

// Import server
import { startServer } from './server/index.js';

// Start the server when this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startServer();
}

// Re-export all modules for easy access
export * from './server/index.js';
export * from './services/agent/index.js';
export * from './services/llm/index.js';
export * from './services/sessions/index.js';
export * from './services/accounting/index.js';
export * from './services/image/index.js';
export * from './services/tasks/index.js';
export * from './config/llm.js';
export * from './config/pricing.js';