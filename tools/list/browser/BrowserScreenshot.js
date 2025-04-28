import {browserScreenshot} from "./browserUtils.js";

export default {
    name: 'BrowserScreenshot',
    schema: {
        type: 'function',
        function: {
            name: 'BrowserScreenshot',
            description: `Makes a screenshot and shows you whats currently on the screen as an image`,
            parameters: {
                type: 'object',
                properties: {
                    browserId: {
                        type: 'string',
                        description: 'Indicates which browser you are making this operation in, this is important, if you dont have browserId, then use BrowserClaim tool to claim one'
                    },
                    additionalPrompt: {
                        type: 'string',
                        description: 'What to pay attention to when taking the screenshot if anything matters specifically'
                    }
                },
                required: ['browserId'],
                additionalProperties: false
            }
        }
    },
    execute: async (args) => browserScreenshot(args),
    getDescriptiveText: (args) => {
        return 'Screenshotting';
    },
    ui: {
        icon: 'public'
    }
};