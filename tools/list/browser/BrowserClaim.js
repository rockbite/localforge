import {claimBrowser} from "./browserUtils.js";

export default {
    name: 'BrowserClaim',
    schema: {
        type: 'function',
        function: {
            name: 'BrowserClaim',
            description: `allows to interact claim a browser window for further interaction`,
            parameters: {
                type: 'object',
                properties: {

                },
                required: [],
                additionalProperties: false
            }
        }
    },
    execute: async (args) => claimBrowser(args),
    getDescriptiveText: (args) => {
        return 'Claiming browser window';
    },
    ui: {
        icon: 'public'
    }
};