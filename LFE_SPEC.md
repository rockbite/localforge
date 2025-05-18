# Localforge Export (`.lfe`) — Specification v1.0.0

A `.lfe` file is a plain‑text **JSON** document that bundles shareable pieces of a Localforge workspace.
At the top level it contains one key—`exports`—which is an **array of objects**. Each object declares its own `type` and a `data` payload whose schema depends on that type.

```jsonc
{
  "lfeVersion": "1.0.0",
  "exports": [
    { "type": "project-prefab", "data": { … } },
    { "type": "mcp",           "data": { … } },
    { "type": "agent",         "data": { … } }
  ]
}
```

---

## 1 Common rules

| Field        | Type            | Notes                                                                 |
| ------------ | --------------- | --------------------------------------------------------------------- |
| `lfeVersion` | `string`        | Semantic version of the spec the file claims to follow **(required)** |
| `exports`    | `array<object>` | One or more export blocks; order is irrelevant                        |
| `type`       | `string`        | Must be exactly one of `project-prefab`, `mcp`, or `agent`            |
| `data`       | `object`        | Schema depends on `type`; extra keys are ignored (forward‑compatible) |

---

## 2 Export block schemas

### 2.1 `project-prefab`

| Field      | Type            | Required | Description                             |
| ---------- | --------------- | -------- | --------------------------------------- |
| `name`     | `string`        | ✓        | Display name of the prefab              |
| `sessions` | `array<object>` | ✓        | List of sessions included in the prefab |

#### Session object

| Field      | Type                    | Required | Description                                                                                              |
| ---------- | ----------------------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `name`     | `string`                | ✓        | Friendly label shown in the UI                                                                           |
| `mcp`      | `string`                | ✓        | **MCP name** powering this session (must match an MCP export in the same file or already installed)      |
| `agent`    | `string`                | ✓        | **Agent name** to run inside that MCP (must match an Agent export in the same file or already installed) |
| `taskList` | `array<object\|string>` | —        | Pre‑seeded tasks; accepts free‑form strings or fully‑shaped task objects understood by Localforge        |

> Sessions are just empty containers for future chats, with predefined configuration

---

### 2.2 `mcp`

| Field  | Type     | Required | Description                                                              |
| ------ | -------- | -------- | ------------------------------------------------------------------------ |
| `name` | `string` | ✓        | Unique handle for this MCP configuration                                 |
| `arg`  | `string` | ✓        | Either a shell **command** (e.g. `ollama serve`) *or* an **HTTP/WS URL** |

(No other keys are defined in v1. Future revisions may add health‑check or env‑var support.)

---

### 2.3 `agent`

| Field             | Type                    | Required | Description                                                                    |
| ----------------- | ----------------------- | -------- | ------------------------------------------------------------------------------ |
| `name`            | `string`                | ✓        | Unique agent handle                                                            |
| `description`     | `string`                | ✓        | One‑liner or paragraph shown in the agent picker                               |
| `personalities`   | `array<object>`         | —        | Up to three entries (`main`, `expert`, `auxiliary`). Missing roles are allowed |
| `tools`           | `array<string>`         | —        | Whitelist of tool names the agent may call. Empty/omitted→ *all* tools        |
| `promptOverrides` | `object<string,string>` | —        | Key = prompt slot (e.g. `"main-system"`), value = full replacement text        |

#### Personality object

| Field      | Type                                | Required | Description                                    |
| ---------- | ----------------------------------- | -------- | ---------------------------------------------- |
| `role`     | `"main" \| "expert" \| "auxiliary"` | ✓        | Which slot this model fills                    |
| `provider` | `string`                            | ✓        | e.g. `openai`, `ollama`, `anthropic`           |
| `model`    | `string`                            | ✓        | Model identifier as understood by the provider |

---

## 3 Versioning & forward‑compatibility

* **Strict read:** unknown `type`→ ignore the block.
* **Loose read:** unknown properties inside known blocks→ ignore but preserve when re‑saving.
* A bump to `lfeVersion` may introduce new fields but will **never repurpose** an existing one.

---

## 4 Minimal examples

### 4.1 Tiny MCP export

```json
{
  "type": "mcp",
  "data": {
    "name": "ollama-local",
    "arg": "http://127.0.0.1:11434"
  }
}
```

### 4.2 Agent with a single personality and custom tool set

```json
{
  "type": "agent",
  "data": {
    "name": "dev-coder",
    "description": "Fast iterative coding assistant",
    "personalities": [
      { "role": "main", "provider": "openai", "model": "gpt-4o-mini" }
    ],
    "tools": ["Bash", "Search", "LS"]
  }
}
```

### 4.3 Prefab linking them together

```json
{
  "type": "project-prefab",
  "data": {
    "name": "Quick-start Demo",
    "sessions": [
      {
        "name": "Code-gen",
        "mcp": "ollama-local",
        "agent": "dev-coder",
        "taskList": [
          "Scaffold a FastAPI service",
          { "title": "Write unit tests", "status": "todo" }
        ]
      }
    ]
  }
}
```

---
