# Locus

One persistent Pi conversation per directory. A small CLI wrapper, with no
build step and one pinned dependency. Requires Linux (`/usr/bin/flock`) and
Node.js 22.19 or newer.

## Install

```sh
cd ~/Locus
npm install
mkdir -p ~/.local/bin
ln -s ~/Locus/bin/locus.js ~/.local/bin/locus
```

Ensure `~/.local/bin` is on your PATH. The link runs this checkout directly.

## Use

```sh
cd /path/to/a/venue
locus init
locus
```

In Pi's terminal chat, use `/login` to connect a provider (choose OpenAI and
Sign in with ChatGPT), `/model` to select a model, and `/settings` for settings.
Exit normally, run `locus` again, and the same conversation resumes.

```sh
locus "Audit your events"           # Interactive chat with an initial task
locus -p "Audit your events"        # One task, then exit
locus --mode json "Audit your events" # JSONL progress for another program
```

## What lives where

Install community packages using Pi's normal sources and options:

```sh
locus install npm:pi-web-access
locus install /path/to/local-package
```

This passes directly to Pi's installer using `~/.locus/agent/` (or
`LOCUS_AGENT_DIR`). It works outside initialized directories and does not
open a conversation. Restart Locus to load installed resources. Pi's `--local`
option instead registers the package in the current project's `.pi/settings.json`.
Packages must support the installed Pi version and may need credentials or
external programs of their own.

- `.locus/session.jsonl`: Pi's native conversation, created when Pi persists it.
- `.locus/lock`: OS lock file; safe to leave in place after exit. A second
  invocation fails with exit code 75 while the first is running.
- `.locus/config.json`: Directory profile, created by `init` if missing.
- `init` does not create an `AGENTS.md` file.
- Existing `AGENTS.md` instructions are still discovered by Pi normally.
- `.pi/settings.json`, `.pi/skills/`, `.pi/extensions/`, `.pi/mcp.json`: Pi's
  normal project configuration, discovered by Pi without a Locus translation.
- `~/.locus/agent/`: Shared credentials, settings, model cache, skills, and extensions.
  Locus sets Pi's `PI_CODING_AGENT_DIR` override to this location. Set
  `LOCUS_AGENT_DIR` to use another location.

Locus only uses the exact current directory; it does not search for a parent
agent. It forwards arguments to the installed Pi CLI, fixing the session path
and storage directory. Pi supplies the terminal, tools, resource discovery,
authentication, streaming, and compaction. The lower-level Pi packages arrive
as dependencies of `pi-coding-agent`; Locus does not import them directly.

Pi may ask you to trust project resources on first interactive use. Automated
runs skip protected project resources unless trust is saved or you pass
Pi's `--approve` option for that invocation.

Pi's native `/new`, branch, and session commands remain available. They can
switch away from the canonical conversation during that invocation; starting
`locus` again always opens `.locus/session.jsonl`. Avoid those commands when
you want one continuous history.

The lock covers Locus invocations, not someone opening the same file directly
with Pi. Working directory and instructions do not restrict filesystem access.
This prototype adds no scheduler, portal, custom memory, or automatic recovery
of interrupted external actions. Add `.locus/` to each project's `.gitignore`
if its transcripts should stay local.

Read `bin/locus.js` for the entire implementation.

## Directory profile

Edit `.locus/config.json` to select Pi options for this directory:

```json
{
  "model": "openai/gpt-6.1-sol",
  "thinking": "high",
  "tools": ["read", "bash", "edit", "write", "grep", "find", "ls"],
  "skills": ["../shared/skills"],
  "preloadSkills": ["../shared/skills/venue-audit/SKILL.md"]
}
```

Every field is optional. `init` starts with empty skill lists, leaving Pi's
model and tool defaults unchanged. Paths resolve from the working directory,
not from `.locus/`; absolute paths and `~/` also work.

`skills` adds files or directories to Pi's skill discovery (descriptions first,
full instructions on demand). `preloadSkills` takes individual skill file paths:
it advertises those skills and appends their full text to the system prompt on
every launch. Preloading does not execute a task or script.

`model` and `thinking` select the startup values even when resuming history.
`tools` uses Pi's tool-selection semantics; plain names replace the default set,
while entries such as `+grep` add to it. Explicit CLI model, thinking, and tool
options override the profile; extra skill and appended-prompt options accumulate.
Restart `locus` after editing this profile; Pi's `/reload` reloads native resources,
but does not rerun the Locus wrapper. Existing directories without a profile
continue to work; rerun `locus init` to create one without replacing history.

## Edit the system prompt

Edit `system-prompt.md` in this repository, then restart `locus`. Every directory
uses this shared file, including when resuming an existing conversation. It is
the identity and behavior of Locus, a persistent directory agent, together with
Pi documentation references. Documentation paths point to this installation
of Pi.

Locus passes the file to Pi's `--system-prompt` option, replacing the default
coding-assistant prompt. Pi still appends discovered project instructions,
skill descriptions, and the current working directory. Tool schemas remain
supplied by Pi. A caller can explicitly override the file with `--system-prompt`.

There is no Locus-wide memory. Conversation history lives in each directory's
`.locus/`. The shared `~/.locus/agent/` directory holds configuration,
credentials, model cache, and shared resources, not a master memory.
Previously generated `AGENTS.md` files are left in place;
remove any starter you no longer want manually.

The dependency override pins Pi's HTTP library to a patched version.

Upstream: [Pi](https://github.com/earendil-works/pi),
[CLI](https://pi.dev/docs/latest/cli),
[configuration](https://pi.dev/docs/latest/configuration),
[skills](https://pi.dev/docs/latest/skills).
