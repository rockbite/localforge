import axios from 'axios';
import TurndownService from 'turndown';
const turndown = new TurndownService();
import puppeteer from 'puppeteer';
import { getRealisticHeaders, getRandomUserAgent } from './realisticHeaders/index.js';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import store from '../../src/db/store.js';
import {callLLMByType, MAIN_MODEL} from "../../src/index.js";

// Simple in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// Clean up expired cache entries
function cleanCache() {
  const now = Date.now();
  for (const [key, { timestamp }] of cache.entries()) {
    if (now - timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}

// Function to validate if a string is a URL
function isValidHttpUrl(string) {
  let url;
  try {
    url = new URL(string);
  } catch (_) {
    return false;
  }
  return url.protocol === "http:" || url.protocol === "https:";
}

/**
 * Fetches content from a URL using axios with realistic headers
 * @param {string} url - The URL to fetch
 * @param {string} prompt - The prompt for processing
 * @param {boolean} returnRaw - Whether to return raw HTML
 */
async function fetchWithHeaders(url, prompt, returnRaw = false) {
  console.log(`Fetching (Headers Mode): ${url}`);
  try {
    const headers = getRealisticHeaders();
    const response = await axios.get(url, {
      headers,
      timeout: 15000, // 15 second timeout
      responseType: 'text', // Ensure raw text/html is received
      maxContentLength: 1024 * 1024, // 1MB limit
      validateStatus: function (status) {
        return status >= 200 && status < 300; // Only resolve for 2xx status codes
      },
    });

    const htmlContent = response.data;

    // If we want raw HTML, return it directly
    if (returnRaw) {
      return {
        url,
        content: htmlContent
      };
    }

    // Convert to markdown for processing
    let content = htmlContent;

    // If HTML, convert to markdown
    if (typeof content === 'string' &&
        (response.headers['content-type']?.includes('text/html') ||
         content.trim().startsWith('<!DOCTYPE') ||
         content.trim().startsWith('<html'))) {
      content = turndown.turndown(content);
    } else if (typeof content !== 'string') {
      content = JSON.stringify(content, null, 2);
    }

    // Truncate if too large
    const MAX_CHARS = 50000;
    if (content.length > MAX_CHARS) {
      content = content.substring(0, MAX_CHARS) + '... [content truncated due to length]';
    }

    // Cache the result
    cache.set(url, { content, timestamp: Date.now() });

    return await processWithLLM(content, prompt, url);

  } catch (error) {
    console.error(`Error fetching ${url} with headers:`, error.message);
    // Provide more context if available
    const status = error.response?.status;
    const statusText = error.response?.statusText;
    return {
      error: `Failed to fetch content from ${url}. ${status ? `Status: ${status} ${statusText}. ` : ''}Reason: ${error.message}`,
      status: error.response?.status,
      statusText: error.response?.statusText
    };
  }
}

/**
 * Fetches content from a URL using Puppeteer for sites that block simple requests
 * @param {string} url - The URL to fetch
 * @param {string} prompt - The prompt for processing
 * @param {boolean} returnRaw - Whether to return raw HTML
 */
async function fetchWithPuppeteer(url, prompt, returnRaw = false) {
  console.log(`Fetching (Puppeteer Mode): ${url}`);
  let browser = null;
  try {
    browser = await puppeteer.launch({ headless: true }); // Use true for server environments
    const page = await browser.newPage();
    await page.setUserAgent(getRandomUserAgent()); // Set realistic UA
    await page.setViewport({ width: 1920, height: 1080 }); // Standard viewport
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }); // Wait until network is mostly idle, 30s timeout

    const htmlContent = await page.content();

    // --- Add Readability Step ---
    let mainContentHtml = '';
    let article = null;
    const fullHtmlContent = htmlContent;

    try {
      // Parse the HTML string into a DOM object using jsdom
      const dom = new JSDOM(fullHtmlContent, {
        url: url // Providing the URL helps Readability resolve relative links
      });

      // Create a Readability instance and parse
      const reader = new Readability(dom.window.document);
      article = reader.parse(); // Returns an object with title, content (HTML), textContent, etc.

      if (article && article.content) {
        mainContentHtml = article.content; // This is the cleaned HTML of the main content
        console.log(`Extracted main content via Readability (${(mainContentHtml.length / 1024).toFixed(1)} KB)`);
      } else {
        console.warn('Readability could not extract main content, falling back to full HTML.');
        mainContentHtml = fullHtmlContent; // Fallback or handle error
      }
    } catch(readabilityError) {
      console.error('Error during Readability processing:', readabilityError);
      mainContentHtml = fullHtmlContent; // Fallback on error
    }

    // --- End Readability Step ---


    // If we want raw HTML, return it directly
    if (returnRaw) {
      return {
        url,
        content: htmlContent
      };
    }

    // Convert to markdown for processing
    let content = turndown.turndown(mainContentHtml);

    // Truncate if too large
    const MAX_CHARS = 80000;
    if (content.length > MAX_CHARS) {
      content = content.substring(0, MAX_CHARS) + '... [content truncated due to length]';
    }

    // Cache the result
    cache.set(url, { content, timestamp: Date.now() });

    return await processWithLLM(content, prompt, url);

  } catch (error) {
    console.error(`Error fetching ${url} with Puppeteer:`, error.message);
    return {
      error: `Failed to fetch content from ${url} using Puppeteer. Reason: ${error.message}`
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Performs a Google search using the Custom Search JSON API
 * @param {string} query - The search query
 */
async function performGoogleSearch(query) {
  console.log(`Performing Google Search for: ${query}`);
  const apiKey = store.getSetting('googleApiKey');
  const cseId = store.getSetting('googleCseId');

  if (!apiKey || !cseId) {
    console.warn('Google Search API Key or CSE ID not configured in environment variables.');
    return {
      error: 'Search functionality is not configured. Missing GOOGLE_API_KEY or GOOGLE_CSE_ID.'
    };
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(query)}`;

  try {
    const response = await axios.get(url, { timeout: 10000 }); // 10s timeout for search
    const results = response.data.items;

    if (!results || results.length === 0) {
      return {
        results: [],
        message: `No search results found for "${query}".`
      };
    }

    // Format results for the LLM
    let formattedResults = `Search Results for "${query}":\n\n`;
    results.slice(0, 5).forEach((item, index) => { // Limit to top 5 results
      formattedResults += `${index + 1}. ${item.title}\n`;
      formattedResults += `   Link: ${item.link}\n`;
      formattedResults += `   Snippet: ${item.snippet?.replace(/\n/g, ' ')}\n\n`; // Clean up snippets
    });

    return {
      results: results.slice(0, 5),
      formattedContent: formattedResults
    };

  } catch (error) {
    console.error(`Error performing Google Search for "${query}":`, error.message);
    const status = error.response?.status;
    const errorData = error.response?.data?.error;
    let details = errorData ? JSON.stringify(errorData) : error.message;
    return {
      error: `Failed to perform search for "${query}". ${status ? `Status: ${status}. ` : ''}Reason: ${details}`
    };
  }
}

/**
 * Processes fetched content with the LLM based on the prompt.
 * @param {string} content - The content to process
 * @param {string} prompt - The prompt to use
 * @param {string} url - The URL that was fetched
 */
async function processWithLLM(content, prompt, url) {
  try {
    const messages = [
      {
        role: 'system',
        content: 'You are a helpful AI that analyzes web content based on a specific prompt. Provide concise, relevant information only.'
      },
      {
        role: 'user',
        content: `Content from web:\n\n${content}\n\nPrompt: ${prompt}`
      }
    ];

    const llmResponse = await callLLMByType(MAIN_MODEL, {
      messages,
      temperature: 0.3,
      max_tokens: 2048
    });

    return {
      url,
      analysis: llmResponse.content
    };
  } catch (error) {
    return { error: `Error processing with LLM: ${error.message}` };
  }
}

/**
 * Main WebFetchTool execution logic
 * @param {{url: string, prompt: string, returnRaw: boolean}} args
 */
async function webFetchUtils(args) {
  const { url: urlOrQuery, prompt, returnRaw = false } = args;
  
  cleanCache(); // Clean expired cache entries
  
  // Check if it's a URL or a search query
  if (isValidHttpUrl(urlOrQuery)) {
    // It's a valid URL
    let urlObj;
    try {
      urlObj = new URL(urlOrQuery);
    } catch (error) {
      return { error: 'Invalid URL format' };
    }

    // Upgrade HTTP to HTTPS
    let url = urlOrQuery;
    if (urlObj.protocol === 'http:') {
      urlObj.protocol = 'https:';
      url = urlObj.toString();
    }

    const cacheKey = url;
    const now = Date.now();

    // Return cached result if available
    if (cache.has(cacheKey)) {
      const { content, timestamp } = cache.get(cacheKey);
      if (now - timestamp < CACHE_TTL) {
        if (returnRaw) {
          return { url, content };
        }
        return await processWithLLM(content, prompt, url);
      }
    }

    // Decide fetch mode
    const usePuppeteer = store.getSetting('usePuppeteer') === true;

    if (usePuppeteer) {
      return await fetchWithPuppeteer(url, prompt, returnRaw);
    } else {
      return await fetchWithHeaders(url, prompt, returnRaw);
    }
  } else {
    // It's a search query
    return await performGoogleSearch(urlOrQuery);
  }
}

export { webFetchUtils as webFetchTool, isValidHttpUrl };