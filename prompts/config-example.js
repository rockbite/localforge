/**
 * Example script showing how to reinitialize the agent with custom configuration
 */
const { initializePrompts } = require('../agentCore');

async function customizeAgent() {
    try {
        // Initialize with custom configuration
        await initializePrompts({ 
            agentName: "CustomAssistant" 
        });
        
        console.log("Agent reconfigured successfully!");
    } catch (error) {
        console.error("Failed to reconfigure agent:", error);
    }
}

// Run the example
customizeAgent();