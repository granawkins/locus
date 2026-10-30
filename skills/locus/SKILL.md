---
name: locus
description: Delegate recurring work to a persistent agent in a specific directory using the Locus CLI. Use for continuing directory-owned tasks or coordinating existing Locus agents from another agent.
license: MIT
metadata:
  compatibility: Linux, Node.js 22.19 or newer, flock, and an installed Locus CLI with a configured Pi model provider.
---

# Delegate to Locus

Each initialized directory owns a continuing conversation. Run the CLI with
that directory as the working directory; starting it in a child or parent
directory selects a different agent. The directory is its responsibility,
not a filesystem sandbox.

## Give work and receive a result

Use an existing installation, or install `@granawkins/locus` with npm when
installation is part of the user's request. Check `locus --help` if needed.
Initialize the intended directory with `locus init` if it has no `.locus/`.
Initialization preserves existing settings and history and creates no
`AGENTS.md`. Provider authentication is configured interactively through
Pi's `/login` in `locus`; an unattended run cannot complete login prompts.

```sh
cd /path/to/venue
locus init
locus -p "Audit the stored events against the venue website. Fix the fetcher if needed, validate the result, and summarize the changes and anything unresolved."
```

`-p` runs the task to completion, prints the final answer, and exits. A later
invocation in the same directory continues the saved conversation. Give the
agent a concrete goal, relevant inputs, allowed actions, verification criteria,
and where to save results. It can maintain working files under `.locus/`.
Task instructions do not grant permissions beyond the user's authorized scope.

If it asks a question, invoke it again with the answer. For long tasks, allow
enough runtime or use the calling environment's background-job mechanism and
retain the handle. Killing a process can interrupt external side effects;
inspect its saved state before retrying an action that might already have run.

## Coordinate several directories

Use a deterministic runner with bounded concurrency. Locus does not provide a
global job queue, scheduler, or shared browser pool. A per-directory OS lock
rejects a competing Locus invocation with exit code 75; it does not queue it.
Do not bypass that lock by opening the transcript directly with Pi.

For durable reporting, define the task's evidence and destination explicitly,
for example an audit record with status, completion time, checked items,
changes, and unresolved questions. Database tools and result schemas are
project integrations, not built-in Locus capabilities. Track failures and
timeouts so interrupted jobs do not remain indefinitely in progress.

## Settings and capabilities

The directory profile is `.locus/settings.json`. Empty values inherit Pi's
normal defaults; explicit CLI model/thinking/tool options take precedence.

- `model`, `thinking`: Pi model selection and reasoning level.
- `customInstructions`: Text or a file path appended to the shared Locus prompt.
- `tools`: Pi tool selection; plain names replace defaults, `+name` adds one.
- `skills`: Additional skill file/directory paths, beyond normal discovery.
- `preloadSkills`: Skill **file paths** whose complete contents become context.

Paths resolve from the working directory, not `.locus/`; absolute paths and
`~/` work for the two skill lists. Skill names alone are not path lookups.
Restart Locus after profile changes. Use `/reload` for Pi's native resources
in an interactive conversation. Project skills and extensions require Pi's
project trust; unattended jobs skip protected resources unless trust is
already saved or the authorized caller explicitly supplies `--approve`.

Shared configuration and credentials live in `~/.locus/agent/`, overridable
with `LOCUS_AGENT_DIR`. Install compatible community resources through
`locus install <source>`; `-l` selects Pi's project `.pi/` configuration.
Tools still need their own credentials and programs. Do not infer browser,
database, or audio capabilities from the existence of a skill alone.

## History and streaming

Pi owns `.locus/session.jsonl` and its session files. Read or search history
when needed, but do not edit it. Compaction retains history on disk without
guaranteeing perfect model recall. Avoid Pi's session-switching and branching
commands when continuing the canonical directory conversation is the goal.

`locus --mode json "task"` streams Pi JSONL events, not a validated final JSON
answer. Inspect completed messages and errors through `agent_settled`; an
assistant failure in JSON mode does not necessarily produce a nonzero process
exit code. Never let two workers write the same transcript.

`locus --mode rpc` supports bidirectional Pi commands for integrations that
need live messages or cancellation. Ordinary delegation usually needs only
`-p`. See the package README for the full user guide.
