---
name: locus
description: Delegate recurring catalog-item work to a persistent directory agent through Locus, or continue work owned by an existing Locus agent.
license: MIT
---

# Locus

The patron saint of a directory: one persistent agent stewards one catalog
item. Run commands in that item's directory. Every invocation continues
`.locus/session.jsonl`; Pi compacts context while retaining inspectable history.

```sh
cd /path/to/item
locus -p "Audit this item, resolve the issues, verify the result, and save the report."
locus -p "Here is the missing detail. Continue."
```

The first run initializes automatically. `-p` waits, prints the answer, and
exits. Capture stdout, stderr, and status; allow enough time for the task.
Specify the goal, authorized changes, verification, and result destination.
Database integrations and completion evidence are project-specific.

- Bound concurrency in the caller. One process per directory is allowed;
  competing runs exit 75. There is no global queue.
- `.locus/settings.json` controls model, thinking, tools, extra skill paths,
  preloaded skill file paths, and additive instructions. Empty values inherit
  defaults. Restart after edits; never edit Pi's session files.
- Pi discovers ancestor `AGENTS.md` and `.agents/skills/` (skills stop at the
  repository root). Project resources require trust; unattended jobs need
  saved trust or an explicit authorized `--approve` decision.
- Shared setup lives in `~/.locus/agent/` or `LOCUS_AGENT_DIR`. Use `locus
  install <source>` for Pi packages and `/reload` in an open chat. Login through
  `/login` interactively; skills do not provide missing tools or credentials.
- JSON mode emits events, not a result schema. Inspect errors through
  `agent_settled`; assistant failures may exit zero. RPC supports live dialogue.

Avoid Pi session-switching commands when preserving the canonical history.
A directory is not a sandbox. Inspect evidence before retrying interrupted
external actions, which may already have taken effect.
