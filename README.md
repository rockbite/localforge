# AI Coding Agent

AI-powered coding assistant with tools for file search, editing, and web browsing.

## Project Structure

This project has been restructured for better organization and clarity:

- `src/`: Main source code
  - `config/`: Configuration files
    - `llm.js`: LLM model settings
    - `pricing.js`: Model pricing info
  - `services/`: Core business logic services
    - `agent/`: LLM agent logic
    - `llm/`: LLM interaction layer
    - `sessions/`: Session management
    - `accounting/`: Token usage tracking
    - `image/`: Image utilities
    - `tasks/`: Task management
  - `server/`: Express server logic
  - `db/`: Database interactions
  - `middleware/`: HTTP middleware
  - `routes/`: API routes
- `electron/`: Electron app files
- `public/`: Static web assets
- `views/`: EJS templates
- `prompts/`: Prompt templates
- `tools/`: Tool implementations
- `tests/`: Test files

## Quick Start

1. Install dependencies:
   ```
   npm install
   ```
2. Copy `.env.example` to `.env` and add your OpenAI API key
3. Start the server:
   ```
   npm run start
   ```
4. Visit `http://localhost:3001` in your browser

## Running the App

- `npm run server`: Start the server
- `npm run dev`: Start development mode (frontend + server)
- `npm start`: Start Electron app

## WebFetchTool Enhancements

The WebFetchTool has been enhanced with the following capabilities:

### Anti-Bot Detection

- **Default Method (Headers)**: Uses realistic, rotating browser headers with each request to avoid basic bot detection.
- **Optional Puppeteer Method**: Set `USE_PUPPETEER=true` in your `.env` file to use Puppeteer's headless browser for fetching content from sites with stronger bot protection.

### Web Search Integration

The tool now supports search queries in addition to direct URLs:

- If the input doesn't look like a URL, it's treated as a search query.
- Searches use Google Custom Search API.
- To enable search functionality, add the following to your `.env` file:
  ```
  GOOGLE_API_KEY="your_google_api_key"
  GOOGLE_CSE_ID="your_custom_search_engine_id"
  ```
- If these values are not provided, the tool will return an error message for search queries.

### Usage

The WebFetchTool accepts the following parameters:
- `url`: A direct URL to fetch OR a search query string
- `prompt`: Instructions for processing the fetched URL content (ignored for search queries)
- `returnRaw`: Set to `true` to return raw HTML instead of processed content (URL fetches only)