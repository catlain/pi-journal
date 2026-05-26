# pi-journal

Session journaling extension for [pi](https://github.com/earendil-works/pi-coding-agent) — automatic session logging, entry indexing, and timeline reconstruction.

## Why You Need It

AI coding sessions generate valuable history — decisions made, code changed, errors fixed. But pi's native session files are raw JSONL, hard to read and search. pi-journal turns sessions into **structured, searchable journals** you can actually use.

**Use it when**: You want to review past sessions, track decisions, find recurring errors, or share session history with your team.

## How It Works

```
Session Start → Create journal file
        │
        ▼ during session
Tool calls, edits, decisions, errors
        │
        ▼ each event
Journal entry logged (timestamp + type + summary + files)
        │
        ▼ session end
Finalize journal with summary
        │
        ▼
<project>/.pi/journal/<date>-<session-id>.json
```

Journal files are stored in `<project>/.pi/journal/` or `~/.pi/agent/journal/` (global).

## Installation

```bash
pi install git:github.com/catlain/pi-journal
```

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

| Scenario | What You Get |
|----------|-------------|
| **Session retrospective** | Read a session's journal to see everything accomplished |
| **Decision log** | Track why certain technical decisions were made |
| **Error patterns** | Find recurring errors across sessions |
| **Audit trail** | See exactly what changes were made and when |
| **Knowledge transfer** | Share session journals with team members |

## Best Practices

### ✅ Recommended
- Commit `.pi/journal/` to git — it's valuable project history
- Review journals after long sessions to catch things you missed
- Use journal type filters to find specific kinds of events
- Pair with pi-session-analyzer for deeper session insights

### ❌ Not Recommended
- Don't store sensitive data in journal summaries
- Don't manually edit journal files — they're auto-generated
- Don't disable journaling for important projects

## Limitations

| Limitation | Detail |
|------------|--------|
| JSONL-based storage | Not a database — search is linear scan |
| No real-time streaming | Entries are flushed periodically, not per-event |
| Storage growth | Journal files accumulate; consider periodic cleanup |
| No cross-project view | Each project has its own journal directory |

## Architecture

```
pi-journal/
├── index.ts       # Entry: register session hooks
├── writer.ts      # Journal file write + flush
├── entry.ts       # Entry type definitions + construction
├── reader.ts      # Journal search + filtering
└── package.json
```

**Dependencies**:
- `@earendil-works/pi-coding-agent` — ExtensionAPI (peer)

## License

MIT
