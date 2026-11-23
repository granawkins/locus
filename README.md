# Locus

**The patron saint of a directory.**

One directory, one persistent agent, one cumulative conversation. Interactive
chats and headless commands continue the same history, with messages and
working artifacts kept in the directory. Locus stewards that work over time,
using Pi's built-in compaction while retaining JSONL history it can inspect.

Built on [Pi](https://pi.dev), Locus supports Pi's conversation CLI modes,
tools, skills, and [community extensions](https://pi.dev/packages). By default,
it inherits `AGENTS.md` instructions from the current directory and its
ancestors, and skills from `.agents/skills/` up to the repository root,
following Pi's project trust rules. Shared skills and native `.pi/`
configuration work normally.

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
| `settings.json` | This directory's Locus settings. |
| `session.jsonl` | Cumulative messages, tool results, and compaction records. |
| `lock` | Lock target; the active lock is maintained in `lock.lock/`. A competing run exits with code 75. |

Locks release on normal exit. After a forced termination, a stale lock becomes
recoverable after two minutes. The agent can keep notes and other working files in `.locus/`. Shared credentials,
settings, skills, and installed packages live in `~/.locus/agent/`; override that
location with `LOCUS_AGENT_DIR`. There is no shared master conversation.

## Settings

Global Pi settings live in `~/.locus/agent/settings.json` (or
`LOCUS_AGENT_DIR/settings.json`); Pi supports its full settings set there.
Each Locus directory has `.locus/settings.json`. Locus passes these local
settings to Pi using CLI options:

| Local field | Effect |
|---|---|
| `defaultProvider`, `defaultModel`, `defaultThinkingLevel` | Choose the model and thinking level. A local provider needs a local or global model. |
| `enabledModels` | Scope available models. |
| `defaultTools` | Select or modify built-in tools; `[]` disables them. |
| `skills`, `extensions`, `prompts`, `themes` | Add resource paths. Local lists accept paths, not exclusion patterns or globs. |
| `theme`, `tuiMode` | Select the initial theme or terminal mode. |
| `contextFiles` | Include or exclude specific context files. |

`defaultTools` accepts either tool names or `+name`/`-name` modifiers; the two
forms cannot be mixed in one local list. An empty `enabledModels` list restores
all available models. Local resource paths resolve from the working directory.

Pi's other settings have no matching CLI option and are not supported in
`.locus/settings.json`; put them in the global file. Pi still reads its native
`.pi/settings.json` when present, subject to project trust. Explicit command
line options take precedence over Locus's local settings. Older local names
(`model`, `thinking`, `tools`, `customInstructions`, `preloadSkills`) remain
supported for existing directories; use Pi's names for new settings. Restart
Locus after editing settings. `system-prompt.md` defines the shared identity.

Locus reads `contextFiles.include` and `contextFiles.exclude` from both the
global Pi settings and local `.locus/settings.json`, combining the lists.
Relative global paths resolve from the agent directory; relative local paths
resolve from the working directory. `~/` and absolute paths also work.

When either `contextFiles` list is nonempty, Locus starts with Pi's normal
context-file discovery, removes excluded files, then adds included files even
outside that discovery path. Exclusion wins if a file appears in both lists;
symlinked paths are treated as the same file. Each path must name an existing
file. This setting does not filter other system-prompt additions. Skills are
unaffected. For example, a source agent can omit repository-wide instructions
while loading its own:

```json
{
  "contextFiles": {
    "include": ["/absolute/path/to/source/AGENTS.md"],
    "exclude": ["/absolute/path/to/repo/AGENTS.md"]
  }
}
```

### First-run bootstrap

The global `~/.locus/agent/settings.json` can also contain Locus-only bootstrap
rules. A rule matches directories exactly `depth` levels below an absolute
`root`; only matching directories run its command. For example:

```json
{
  "bootstrap": [{
    "root": "/srv/cityhappenings/sources",
    "depth": 2,
    "command": ["python3", "/srv/cityhappenings/.agents/skills/source-management/scripts/bootstrap.py"]
  }]
}
```

On the first conversation in a matching directory, Locus creates `.locus/`,
then runs `command prepare DIRECTORY` before loading Pi's context. The command
prepares local instructions/settings and prints JSON containing a `prompt`
string (or `null` if already set up). Locus sends a non-null prompt as a first
turn in the same persistent session, then runs `command verify DIRECTORY`.
Only successful verification writes `.locus/bootstrap-complete` and forwards
the original command. A failed setup leaves the original command unsent and
retries on the next invocation. Later calls check only the marker. Setup
output goes to stderr so JSON/RPC output for the original command stays clean.
Both turns hold one directory lock. `locus init`, help, version, and package
installation do not run bootstrap.

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
