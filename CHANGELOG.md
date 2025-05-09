# Changelog
All notable changes to **Localforge** will be documented in this file.  
This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) conventions and uses [Semantic Versioning](https://semver.org/).


## [1.0.23] – TBD

* Instead of hardcoded 3001 now runs on any available port (will try 3826 as default first as least common, then find other options if still busy)
* Added "Compress" button on top of each chat, that will use Expert model in order to summarize a long conversation history, to save up tokens as it blows up.

## [1.0.22] – 2025-05-09

### Added
- **Background typing:** The text editor stays responsive while the model is busy (submissions are still blocked until the model is ready).

### Fixed
- **Message Prompt Editor (Block tab):** Send button now responds as expected.
- **`view` tool:** Detects large image binaries and avoids loading them as plain text.
- **Token counter:** Reports token counts accurately.
- **Socket uploads:** Large PNG attachments no longer crash the connection.
- **macOS build:** Release is now a universal binary supporting both Intel and Apple Silicon.


## [1.0.14] – 2025-04-25
* Chat messages context now show system prompt
* Fixed bug with simultaneous tool call + content response
* Total refactor for CSS structure and support for multiple themes (introduced light/dark mode)
* Auto updating feature for npm case
* Added support for creating agent flavours for system prompt, model and tool overrides per chat
* Added Caramel Latte & Dark Coffee themes

---

## [1.0.11] – 2025-04-25
### Added
- **Prompt Editor** – edit prompts as drag-n-drop blocks (foundation for a future system-prompt library).
- **New LLM providers**: Anthropic (Claude), Google Gemini, Google Vertex AI, and **Ollama**.
- **Custom base-URL support** for all providers, bringing the roster to:  
  *OpenAI, Azure OpenAI, DeepSeek, Groq, Anyscale, Fireworks, Together, Mistral, Perplexity, OpenRouter, Gemini, Vertex AI, Claude, Ollama.*
- **Settings dialog 2.0**
    - Split “Web Fetch” options into its own tab.
    - Models tab now shows provider types.
    - Full CRUD for providers (create, edit, delete).
    - Three independent model-preset slots (aux, main, expert) – each can point to any provider.

### Changed
- **LLM middleware refactor** – nuked the spaghetti; now lean, readable, and provider-agnostic.

### Fixed
- First user message is no longer accidentally duplicated in LLM conversations.

### Removed
- Dead “shitcode” purged from middleware.
