<h1 align="center">Localforge — Intelligent Coding Assistant</h1>
<p align="center">Runs in a local web UI and autonomously works on your files alongside you.</p>

<p align="center"><code>npm i -g @rockbite/localforge</code></p>

[![Latest release](https://img.shields.io/github/v/release/rockbite/localforge)](https://github.com/rockbite/localforge/releases)
[![MIT licensed](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Stars](https://img.shields.io/github/stars/rockbite/localforge?style=social)
[![](https://dcbadge.limes.pink/api/server/KJrTd6cw8D?style=flat)](https://discord.gg/KJrTd6cw8D)

![Localforge screenshot](https://github.com/user-attachments/assets/94966e7c-0f9b-440a-b76d-f9e3cf53314b)

---

## Quick Start

```bash
# install dependencies
npm install

# start the development server
npm run start
```

## Or better yet - Use NPM install

```bash
npm i -g @rockbite/localforge</code>
```

## Setup

1. **Launch Localforge**  
   • **CLI** – `localforge`

2. **Open Settings** (top-right) and add your credentials:

| Credential | Used for | Where to get it |
|------------|----------|-----------------|
| **OpenAI API key** (required) | all LLM tasks | <https://platform.openai.com/account/api-keys> → **Create secret key** |
| **Google API key + CSE ID** (optional) | smarter web look-ups | Google Cloud Console → enable **Custom Search JSON API** → create key.<br>Then <https://cse.google.com/cse/create/new> → copy **Search engine ID** |

> Keys are stored locally in `~/.localforge/* and never leave your machine.

3. **Optional tweaks**  
   • Toggle **Web Integration** to start/stop the headless Chrome helper (on by default; disable to save RAM).  
   • Model slots are pre-filled (`gpt-4o-mini`, `gpt-4o`, `o3`) and can be edited later.

---

### License

This project is released under the [MIT License](LICENSE).


Want to support us?
[Buy Supporter Edition →](https://azakhary.gumroad.com/l/htqavs)

Get priority on discord, and help the project grow!


Example Results:

<img src="https://github.com/user-attachments/assets/153dda0e-a41f-46ad-84bc-71d32b883b67" alt="snakes" width="50%">

