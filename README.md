# Locus

**The patron saint of a directory.**

One directory, one persistent agent, one cumulative conversation. Interactive
chats and headless commands continue the same history, with messages and
working artifacts kept in the directory. Locus stewards that work over time,
using Pi's built-in compaction while retaining JSONL history it can inspect.

Built on [Pi](https://pi.dev), Locus supports Pi's conversation CLI modes,
tools, skills, and [community extensions](https://pi.dev/packages). It inherits
`AGENTS.md` instructions from the current directory and its ancestors, and
skills from `.agents/skills/` up to the repository root, following Pi's project
trust rules. Shared skills and native `.pi/` configuration work normally.

## Install

```sh
npm install -g @granawkins/locus
```

Requires Node.js 22.19+ on Linux, macOS, or Windows. Pi is included as a
dependency. On first use, run `locus` and use `/login` and `/model`
to connect a provider and select a model. On Windows, install Git for Windows
for Pi's default Bash tool, or select its PowerShell tool; see
[Pi on Windows](https://pi.dev/docs/latest/windows).

## Commands

Run Locus from the directory you want it to steward. It initializes automatically.

```sh
locus                              # Interactive conversation
locus "Audit your events"           # Interactive, starting with this question
locus -p "Audit your events"        # Run to completion and print the answer
locus -h                           # Help
locus --mode json "Audit events"    # Stream Pi JSONL events
locus --mode rpc                    # Bidirectional Pi connection
locus install npm:pi-web-access     # Install a shared community package
locus install -l npm:some-package   # Install for the current Pi project
```

Use `/reload` in an open chat after changing Pi resources or installing a package.
Project skills and extensions require Pi's project trust; unattended runs can
use already-saved trust or an explicit `--approve` decision.

## State

The first run creates `.locus/` in the current directory:

| File | Purpose |
|---|---|
| `settings.json` | This directory's settings. |
| `session.jsonl` | Cumulative messages, tool results, and compaction records. |
| `lock` | Lock target; the active lock is maintained in `lock.lock/`. A competing run exits with code 75. |

Locks release on normal exit. After a forced termination, a stale lock becomes
recoverable after two minutes. The agent can keep notes and other working files in `.locus/`. Shared credentials,
settings, skills, and installed packages live in `~/.locus/agent/`; override that
location with `LOCUS_AGENT_DIR`. There is no shared master conversation.

## Directory settings

Edit `.locus/settings.json`. All fields start empty and are optional.

| Field | Value |
|---|---|
| `model` | Pi model reference, such as `provider/model-id`. |
| `thinking` | Pi reasoning level, such as `medium` or `high`. |
| `customInstructions` | Text or an existing file path, added to the Locus system prompt. |
| `tools` | Tool names; plain names replace defaults, `+grep` adds a tool. |
| `skills` | Extra skill file/directory paths beyond automatic discovery. |
| `preloadSkills` | Skill file paths whose full instructions are always included in context. |

Blank values inherit normal Pi settings and saved-session defaults. Paths are
relative to the working directory; skill paths also accept `~/`. Explicit CLI
model, thinking, and tool options override these settings. Restart Locus after
editing this file. `system-prompt.md` in the package defines the shared identity;
`settings.template.json` defines the initial settings.

## Use from another agent

Run `locus -p "task"` with the target directory as the working directory and
capture its answer and exit status. Invoke it again to continue. The included
[skill](skills/locus/SKILL.md) is a concise operating guide; copy its directory
into your harness's skills location to make it discoverable.

Limit concurrent jobs in the caller: Locus has no global queue. JSON mode emits
Pi events, not a validated result object; inspect errors and completion through
`agent_settled`. Database updates and completion evidence are task-specific.
Pi's session-switching commands can leave the canonical conversation during a
run; avoid them when maintaining one history. Tools use the invoking account's
permissions; a directory is not a sandbox.

MIT. [GitHub](https://github.com/granawkins/locus) ·
[Pi documentation](https://pi.dev/docs/latest) · `npm test`
