# Locus

**One persistent agent per directory, powered by [Pi](https://pi.dev).**

Give a venue, a book, or any other unit of work its own agent. Ask it to do a
task, let it exit, and come back later: the next invocation resumes the same
conversation. Locus is designed for both people and agents delegating work
through a terminal.

## Install

```sh
npm install -g @granawkins/locus
```

Requires **Linux**, **Node.js 22.19 or newer**, and `flock` at `/usr/bin/flock`
(usually provided by `util-linux`). Pi is installed as a dependency; you do
not need a separate Pi installation. macOS and Windows are not supported yet.

## Start a directory agent

```sh
cd /path/to/venue
locus
```

Use `/login` to connect a model provider and `/model` to choose a model.
For OpenAI subscription access, choose **Sign in with ChatGPT** in the OpenAI
login flow. Authentication and model availability are handled by Pi.

The first conversation command creates `.locus/settings.json` with all fields
empty automatically. Existing settings and history are preserved, and no
`AGENTS.md` is created. The conversation is saved to `.locus/session.jsonl`.
Use `locus init` only if you want to prepare settings before starting a chat.

```sh
locus "Audit your events"             # Chat with an initial task
locus -p "Audit your events"          # Finish the task, print the answer, exit
locus -p "Here is the answer to your question. Continue."
locus --help
```

Run every command from the directory whose agent you intend to address.
Locus does not search parent directories for another agent's `.locus/`.

## Delegate from another agent

Invoke `locus -p` with the target directory as the working directory and
capture stdout, stderr, and the exit status. The command waits until the run
finishes. Return later with another prompt to continue that same conversation.

Give the agent its goal, relevant inputs, allowed actions, verification
criteria, and the expected result location. For example, a venue audit could
save a report and update a project-specific audit record only after checks
pass. Locus does not supply a database integration or enforce a result schema.

Use a bounded worker pool for many directories. Each directory permits one
Locus invocation at a time; a conflicting invocation exits with code **75**.
There is no global concurrency limit or job queue. Use your host's background
job support for tasks that exceed its command timeout, and record failures so
an interrupted audit is not left permanently marked as processing.

The included [Locus skill](skills/locus/SKILL.md) gives other agents a fuller
operating guide. To make it discoverable by agents that support Agent Skills,
copy it from your global npm installation into a skills directory:

```sh
mkdir -p ~/.agents/skills
cp -R "$(npm root -g)/@granawkins/locus/skills/locus" ~/.agents/skills/
```

Use the skill directory your harness supports if it does not scan
`~/.agents/skills/`. The skill can also be read directly from this repository.

## Directory settings

Edit `.locus/settings.json`:

```json
{
  "model": "",
  "thinking": "",
  "customInstructions": "",
  "tools": [],
  "skills": [],
  "preloadSkills": []
}
```

| Field | Meaning |
|---|---|
| `model` | Pi model reference, such as `provider/model-id`. |
| `thinking` | Pi reasoning level, such as `medium` or `high`. |
| `customInstructions` | Text or an existing file path appended to the shared Locus prompt. |
| `tools` | Pi tool selection. Plain names replace the default set; `+grep` adds to it. |
| `skills` | Additional skill file or directory paths, advertised for on-demand use. |
| `preloadSkills` | Individual skill file paths whose entire contents are added to context. |

Empty values add no overrides. Normal shared and project Pi settings still
apply; a resumed session can restore its saved model and thinking level.
Explicit command-line model, thinking, and tool options take precedence over
the directory settings. Skill paths and appended instructions accumulate.

Paths resolve from the working directory, not `.locus/`. The two skill lists
also accept absolute paths and `~/`. They take **paths, not skill names**.
An empty tool list inherits defaults; use `--no-tools` to disable all tools.

Restart Locus after changing its directory settings. Use `/reload` for changes
to Pi's native skills, extensions, instructions, and other resources while
chatting. Old `.locus/config.json` profiles migrate on the next launch or
`init` if no settings file exists. The old file is retained as a backup and
its `systemPrompt` field becomes additive `customInstructions`.

## Skills, tools, and extensions

Locus preserves Pi's tools and resource discovery. Default tools are `read`,
`bash`, `edit`, and `write`. Existing `AGENTS.md` instructions and discovered
skills remain available; Locus does not generate directory instructions.

```sh
locus install npm:pi-web-access
locus install /path/to/local-package
locus install -l npm:some-package
```

Installation is shared across your Locus agents by default. `-l` uses Pi's
project-local `.pi/settings.json`. These commands work without `locus init`.
A new Locus process loads installed resources; an open chat can use `/reload`.
Packages must support the installed Pi version and may need their own API
keys, browsers, or other programs.

Project resources require Pi's project trust. Interactive Pi may ask for a
trust decision. Unattended runs skip protected project resources unless trust
is already saved or you explicitly pass `--approve` for that invocation.

See Pi's [skills](https://pi.dev/docs/latest/skills),
[configuration](https://pi.dev/docs/latest/configuration), and
[package catalog](https://pi.dev/packages) for discovery and setup details.

## State and identity

| Location | Purpose |
|---|---|
| `.locus/settings.json` | This directory's Locus settings. |
| `.locus/session.jsonl` | Pi-managed conversation and tool history. |
| `.locus/lock` | OS lock; remains on disk but releases automatically on exit. |
| `.locus/notes/`, `.locus/work/` | Optional working files maintained by the agent. |
| `~/.locus/agent/` | Shared Pi credentials, settings, model cache, skills, and packages. |
| `.pi/` | Pi's native project configuration and resources. |

Set `LOCUS_AGENT_DIR` to use a different shared directory. There is no master
conversation shared across directories. Full historical retention does not
mean perfect active recall after compaction; the agent can search its saved
history. Do not edit Pi's session files manually.

The bundled `system-prompt.md` supplies the Locus identity. Directory custom
instructions add to it. Pi's native `/new`, branching, and session-switching
commands remain available, but can switch away from the canonical conversation
within that invocation. The next `locus` launch returns to `session.jsonl`.

Pi tools run with the permissions of the invoking account; the directory is
an organizational boundary, not a sandbox. Locus does not automatically resume
interrupted external actions. Add `.locus/` to your project's `.gitignore` if
its transcripts and working files should stay local.

## Structured integrations

```sh
locus --mode json "Audit your events"
locus --mode rpc
```

JSON mode streams Pi events, not a validated final JSON answer. Inspect
completed messages and errors through `agent_settled`; a failed assistant
response in JSON mode does not necessarily cause a nonzero exit code.
RPC keeps a bidirectional connection open for live input and cancellation.
See [Pi CLI integration](https://pi.dev/docs/latest/cli-integration).

## Development

```sh
npm ci
npm test
npm pack --dry-run
```

No build step is required. The repository is organized as:

```text
bin/locus.js                     CLI entry point
src/cli.js                       Command routing and session-option ownership
src/settings.js                  Initialization, migration, profile validation
src/pi.js                        Pi launch, shared state, per-directory locking
system-prompt.md                  Shared agent identity
templates/settings.template.json  Starter directory settings
skills/locus/SKILL.md             Agent-facing usage guide
test/                            Local tests; no provider credentials required
```

Tests run automatically before packing. The npm package includes only runtime
code, templates, the prompt, the skill, and the standard package documentation.
It excludes local conversations and credentials.

Release preparation is documented in [docs/releasing.md](docs/releasing.md).

MIT licensed. Pi is a separate, MIT-licensed dependency maintained upstream.
