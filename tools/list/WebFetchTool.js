import { webFetchTool, isValidHttpUrl } from '../utils/webFetchUtils.js';
import store from '../../src/db/store.js';

export default {
  name: 'WebFetchTool',
  schema: {
    type: 'function',
    function: {
      name: 'WebFetchTool',
      description: `- Fetches content from a specified URL using realistic headers (or optionally Puppeteer if configured) and processes it with an AI model using the provided prompt.
- If the input is NOT a valid URL, it attempts to perform a Google Search (requires GOOGLE_API_KEY and GOOGLE_CSE_ID environment variables) and returns formatted search results.
- Takes a URL or search query ('url') and a 'prompt' for processing fetched URL content.
- 'returnRaw' (boolean, optional): If true for a URL fetch, returns raw HTML instead of AI-processed summary.
- Use this tool to retrieve and analyze specific web pages or to search the web for information.`,
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'The URL to fetch content from, OR a search query string.'
          },
          prompt: {
            type: 'string',
            description: 'The prompt to run on the fetched content *if* the input was a URL. Ignored for search queries.'
          },
          returnRaw: {
            type: 'boolean',
            description: 'For URL fetches only: Return RAW webpage html instead of Summarized/Processed content. Defaults to false.'
          }
        },
        required: ['url', 'prompt'],
        additionalProperties: false
      }
    }
  },
  execute: async (args) => webFetchTool(args),
  getDescriptiveText: (args) => {
    if (isValidHttpUrl && isValidHttpUrl(args.url)) {
      const mode = store.getSetting('usePuppeteer') === 'true' ? 'Puppeteer' : 'Headers';
      return `Fetching URL (${mode} Mode): ${args.url}`;
    } else {
      return `Searching Web for: "${args.url}"`;
    }
  },
  ui: {
    icon: 'public'
  }
};