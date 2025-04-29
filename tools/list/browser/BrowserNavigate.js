import {browserNavigate} from "./browserUtils.js";

export default {
    name: 'BrowserNavigate',
    schema: {
        type: 'function',
        function: {
            name: 'BrowserNavigate',
            description: `navigates to a specified URL in browser window, it's important to provide browserId for this operation, if you don't have browserId, then use BrowserClaim tool to claim one`,
            parameters: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to navigate'
                    },
                    browserId: {
                        type: 'string',
                        description: 'Indicates which browser you are making this operation in, this is important, if you dont have browserId, then use BrowserClaim tool to claim one'
                    }
                },
                required: ['browserId', 'url'],
                additionalProperties: false
            }
        }
    },
    execute: async (args) => browserNavigate(args),
    getDescriptiveText: (args) => {
        return 'Navigating';
    },
    ui: {
        icon: 'public'
    }
};