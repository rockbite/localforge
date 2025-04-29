import puppeteer from 'puppeteer';
import crypto from 'crypto';
import {generateImageDescription, MAIN_MODEL} from "../../../src/index.js"; // For generating unique IDs

// In-memory storage for browser instances, pages, and console logs
const browsers = {};
const pages = {};
const consoleLogs = {};

/**
 * Launches a new Puppeteer browser instance and assigns it a unique ID.
 * @async
 * @function claimBrowser
 * @param {object} args - Currently no arguments are used, but kept for potential future expansion.
 * @returns {Promise<string>} A promise that resolves with the unique browser ID.
 * @throws {Error} If Puppeteer fails to launch.
 */
export async function claimBrowser(args = {}) {
    try {
        const browserId = Math.random().toString(36).substring(2, 6);
        console.log(`Claiming browser with ID: ${browserId}`);

        // Launch puppeteer - consider adding options like { headless: "new" } or args
        const browser = await puppeteer.launch();
        browsers[browserId] = browser;

        // Create an initial page for this browser instance
        const page = await browser.newPage();
        pages[browserId] = page;

        // Initialize console log storage for this browser instance
        consoleLogs[browserId] = [];

        // Set up console listener for the page
        page.on('console', msg => {
            // Ensure the log store still exists (in case browser was closed unexpectedly)
            if (consoleLogs[browserId]) {
                // Store log type and text
                consoleLogs[browserId].push({ type: msg.type(), text: msg.text() });
            }
        });

        // Handle browser disconnection
        browser.on('disconnected', () => {
            console.log(`Browser ${browserId} disconnected. Cleaning up.`);
            cleanUpBrowser(browserId); // Clean up resources if browser closes unexpectedly
        });


        console.log(`Browser ${browserId} claimed successfully.`);
        return browserId;
    } catch (error) {
        console.error("Error claiming browser:", error);
        return `Failed to claim browser: ${error.message}`;
    }
}

/**
 * Navigates the browser associated with the given ID to a specific URL.
 * @async
 * @function browserNavigate
 * @param {object} args - Arguments object.
 * @param {string} args.browserId - The ID of the browser instance to use.
 * @param {string} args.url - The URL to navigate to.
 * @param {object} [args.options] - Optional Puppeteer navigation options (e.g., waitUntil, timeout).
 * @returns {Promise<void>} A promise that resolves when navigation is complete.
 * @throws {Error} If the browserId is invalid or navigation fails.
 */
export async function browserNavigate(args) {
    const { browserId, url, options = {} } = args;

    if (!pages[browserId]) {
        return `Invalid browserId: ${browserId}. Browser session not found or already closed.`;
    }

    try {
        const page = pages[browserId];
        console.log(`Browser ${browserId}: Navigating to ${url}`);
        await page.goto(url, { waitUntil: 'networkidle0', ...options }); // Default wait until network is idle
        console.log(`Browser ${browserId}: Navigation to ${url} successful.`);

        return `Navigated to ${url} successfully.`;

    } catch (error) {
        console.error(`Browser ${browserId}: Error navigating to ${url}:`, error);
       return `Failed to navigate: ${error.message}`;
    }
}

/**
 * Performs an interaction on the page associated with the browser ID.
 * Clears any stored console logs *before* executing the interaction.
 * @async
 * @function browserInteract
 * @param {object} args - Arguments object.
 * @param {string} args.browserId - The ID of the browser instance.
 * @param {string} args.method - The Puppeteer Page method to call (e.g., 'click', 'type', 'keyboard.press', 'evaluate', 'mouse.click').
 * @param {object} args.interactionArgs - An object containing the arguments for the specified Puppeteer method.
 * - For 'click': { selector: string, options?: object }
 * - For 'type': { selector: string, text: string, options?: object }
 * - For 'keyboard.press': { key: string, options?: object }
 * - For 'evaluate': { pageFunction: Function | string, args?: any[] }
 * - For 'mouse.click': { x: number, y: number, options?: object }
 * // Add other methods as needed
 * @returns {Promise<any>} A promise that resolves with the result of the interaction (if any, e.g., from evaluate).
 * @throws {Error} If the browserId is invalid, the method is unsupported, or the interaction fails.
 */
export async function browserInteract(args) {
    const { browserId, method, methodArguments } = args;

    let interactionArgs = {};
    try {
        interactionArgs = JSON.parse(methodArguments);
    } catch (error) {
        return "Could not parse methodArguments, please provide a valid JSON string. Example: {\"x\": 10, \"y\": 20}";
    }

    if (!pages[browserId]) {
        return `Invalid browserId: ${browserId}. Browser session not found or already closed.`;
    }
    if (!interactionArgs) {
        return `Missing interactionArgs for method ${method}`;
    }

    // Clear console logs before interaction
    if (consoleLogs[browserId]) {
        consoleLogs[browserId] = [];
        console.log(`Browser ${browserId}: Cleared console logs before interaction.`);
    } else {
        // This case should ideally not happen if claimBrowser worked correctly
        console.warn(`Browser ${browserId}: Console log storage not found before clearing.`);
        consoleLogs[browserId] = []; // Initialize just in case
    }


    try {
        const page = pages[browserId];
        console.log(`Browser ${browserId}: Performing interaction - Method: ${method}`);

        let result;
        switch (method) {
            case 'click':
                if (!interactionArgs.selector) return "Missing 'selector' in interactionArgs for 'click'";
                result = await page.click(interactionArgs.selector, interactionArgs.options || {});
                break;
            case 'type':
                if (!interactionArgs.selector) return "Missing 'selector' in interactionArgs for 'type'";
                if (interactionArgs.text === undefined || interactionArgs.text === null) return "Missing 'text' in interactionArgs for 'type'";
                result = await page.type(interactionArgs.selector, interactionArgs.text, interactionArgs.options || {});
                break;
            case 'keyboard.press':
                if (!interactionArgs.key) return "Missing 'key' in interactionArgs for 'keyboard.press'";
                result = await page.keyboard.press(interactionArgs.key, interactionArgs.options || {});
                break;
            case 'evaluate':
                if (!interactionArgs.pageFunction) return "Missing 'pageFunction' in interactionArgs for 'evaluate', please provide";
                result = await page.evaluate(interactionArgs.pageFunction, ...(interactionArgs.args || []));
                break;
            case 'mouse.click':
                if (interactionArgs.x === undefined || interactionArgs.y === undefined) return "Missing 'x' or 'y' in interactionArgs for 'mouse.click'";
                result = await page.mouse.click(interactionArgs.x, interactionArgs.y, interactionArgs.options || {});
                break;
            // Add more cases for other puppeteer methods as needed e.g. waitForSelector, $, $$ etc.
            default:
                return `Unsupported interaction method: ${method}`;
        }

        console.log(`Browser ${browserId}: Interaction ${method} successful.`);
        if(result) {
            return `Interaction ${method} executed successfully, result: ${JSON.stringify(result)}`;
        } else {
            return `Interaction ${method} executed successfully.`;
        }

    } catch (error) {
        console.error(`Browser ${browserId}: Error during interaction ${method}:`, error);
        return `Interaction failed: ${error.message}`;
    }
}

/**
 * Takes a screenshot of the current page for the given browser ID.
 * @async
 * @function browserScreenshot
 * @param {object} args - Arguments object.
 * @param {string} args.browserId - The ID of the browser instance.
 * @param {boolean} [args.fullPage=false] - Whether to capture the full scrollable page. Defaults to false.
 * @param {object} [args.options] - Additional Puppeteer screenshot options (overrides encoding).
 * @returns {Promise<object>} A promise that resolves with an object containing:
 * - `image`: The screenshot image encoded in base64.
 * - `consoleLogs`: An array of console log objects ({type: string, text: string}) captured since the last interaction.
 * @throws {Error} If the browserId is invalid or the screenshot fails.
 */
export async function browserScreenshot(args) {
    const { browserId, additionalPrompt, fullPage = false, options = {}, sessionData } = args;

    if (!pages[browserId]) {
        return `Invalid browserId: ${browserId}. Browser session not found or already closed.`;
    }

    try {
        const page = pages[browserId];
        console.log(`Browser ${browserId}: Taking screenshot (fullPage: ${fullPage}).`);

        const screenshotOptions = {
            encoding: 'base64',
            fullPage: fullPage,
            ...options // Allow overriding defaults except encoding
        };

        const base64Image = await page.screenshot(screenshotOptions);

        // Retrieve console logs collected since the last clear (done by browserInteract)
        const logs = consoleLogs[browserId] || [];
        console.log(`Browser ${browserId}: Screenshot taken. Returning image and ${logs.length} console log(s).`);

        const mime = 'image/png';
        const dataUrl = `data:${mime};base64,${base64Image.replace(/\s+/g, '')}`;

        let description = await generateImageDescription(dataUrl, MAIN_MODEL, additionalPrompt, sessionData);

        let text = "Screenshot depicts: \n\n" + description + "\n\nConsole log info: \n" + JSON.stringify(logs);

        return {
            "image-base64": dataUrl,
            text: text
        };
    } catch (error) {
        console.error(`Browser ${browserId}: Error taking screenshot:`, error);
        return `Screenshot failed: ${error.message}`;
    }
}

/**
 * Cleans up resources associated with a specific browser ID.
 * Closes the browser and removes references from storage.
 * @async
 * @function closeBrowser
 * @param {string} browserId - The ID of the browser instance to close.
 * @returns {Promise<void>}
 */
export async function closeBrowser(browserId) {
    console.log(`Browser ${browserId}: Attempting to close...`);
    const browser = browsers[browserId];
    if (browser) {
        try {
            await browser.close();
            console.log(`Browser ${browserId}: Closed successfully.`);
        } catch (error) {
            console.error(`Browser ${browserId}: Error closing browser:`, error);
            // Continue cleanup even if closing fails
        }
    } else {
        console.warn(`Browser ${browserId}: No active browser instance found to close.`);
    }

    // Clean up storage regardless of browser state
    cleanUpBrowser(browserId);

}

/**
 * Helper function to remove browser artifacts from memory.
 * @param {string} browserId - The ID of the browser instance to clean up.
 */
function cleanUpBrowser(browserId) {
    delete pages[browserId];
    delete browsers[browserId];
    delete consoleLogs[browserId];
    console.log(`Browser ${browserId}: Cleaned up internal references.`);
}


// Example Usage (Optional - you would call these functions from your main application logic)
/*
async function runExample() {
    let browserId1, browserId2;
    try {
        // --- Browser 1 ---
        browserId1 = await claimBrowser();
        await browserNavigate({ browserId: browserId1, url: 'https://example.com' });

        // Interact - click the 'h1' (example selector)
        await browserInteract({
            browserId: browserId1,
            method: 'evaluate',
            interactionArgs: {
                pageFunction: () => console.log("Hello from browser context! H1 text:", document.querySelector('h1')?.innerText)
            }
        });
         await browserInteract({
            browserId: browserId1,
            method: 'click',
            interactionArgs: { selector: 'h1' } // Example - might not do anything on example.com
        });


        let screenshot1 = await browserScreenshot({ browserId: browserId1 });
        console.log(`Browser ${browserId1}: Screenshot captured. Log count: ${screenshot1.consoleLogs.length}`);
        console.log(`Browser ${browserId1}: Logs:`, screenshot1.consoleLogs);
        // console.log(`Browser ${browserId1}: Image data (truncated):`, screenshot1.image.substring(0, 50) + '...');


        // --- Browser 2 ---
        browserId2 = await claimBrowser();
        await browserNavigate({ browserId: browserId2, url: 'https://google.com' });

        // Interact - type into search bar (selector might change for Google)
        await browserInteract({
             browserId: browserId2,
             method: 'type',
             interactionArgs: { selector: 'textarea[name="q"]', text: 'puppeteer examples' }
         });
         // Interact - press Enter
         await browserInteract({
             browserId: browserId2,
             method: 'keyboard.press',
             interactionArgs: { key: 'Enter' }
         });
         // Wait for navigation/results implicitly via screenshot or add explicit wait interaction
         await new Promise(resolve => setTimeout(resolve, 2000)); // Simple wait

        let screenshot2 = await browserScreenshot({ browserId: browserId2, fullPage: true });
        console.log(`Browser ${browserId2}: Full page screenshot captured. Log count: ${screenshot2.consoleLogs.length}`);
        console.log(`Browser ${browserId2}: Logs:`, screenshot2.consoleLogs);


    } catch (error) {
        console.error("Example run failed:", error);
    } finally {
        // Clean up
        if (browserId1) await closeBrowser(browserId1);
        if (browserId2) await closeBrowser(browserId2);
        // Ensure Puppeteer fully exits if something hangs (less ideal)
        // process.exit(0);
    }
}
*/