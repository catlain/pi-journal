# pi-journal

Session journaling extension for [pi-coding-agent](https://github.com/earendil-works/pi-coding-agent) — automatic session logging, entry indexing, and timeline reconstruction.

## What It Does

AI coding sessions generate valuable history — decisions made, code changed, errors fixed. But pi's native session files are raw JSONL, hard to read and search. pi-journal turns sessions into **structured, searchable journals**:

- **Automatic logging** — Records session events in a structured journal format
- **Entry indexing** — Indexes entries by type (edit, command, decision, error) for fast retrieval
- **Timeline reconstruction** — Rebuilds a readable timeline from journal entries
- **Cross-session history** — Maintains a persistent log across multiple sessions

## Installation

```bash
pi install git:github.com/catlain/pi-journal
```

## How It Works

pi-journal hooks into pi's session lifecycle events:

1. **Session start** — Creates a new journal file for the session
2. **During session** — Logs significant events (edits, commands, decisions, errors)
3. **Session end** — Finalizes the journal with a summary

Journal files are stored in `<project>/.pi/journal/` or `~/.pi/agent/journal/` (global).

## Journal Format

Each journal entry includes:

| Field | Description |
|-------|-------------|
| Timestamp | When the event occurred |
| Type | `edit`, `command`, `decision`, `error`, `tool_call` |
| Summary | Human-readable description |
| Files | List of affected file paths |
| Details | Additional context (error messages, command output, etc.) |

## Use Cases

- **Session retrospectives** — Review what you accomplished in a session
- **Decision log** — Track why certain technical decisions were made
- **Error history** — Find patterns in recurring errors
- **Audit trail** — See exactly what changes were made and when
- **Knowledge transfer** — Share session journals with team members

## Dependencies

- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
