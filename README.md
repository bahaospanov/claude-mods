# bahaospanov

Bakhtiyar Ospanov's Claude Code mods: plugins built on function hooks. Early access; the API
changes between releases.

## Mods

One mod per purpose.

| Mod | Purpose |
| --- | --- |
| [git-gates](#git-gates) | Git work is authorized and tidy |
| [lean-docs](#lean-docs) | Docs worth keeping |
| [lean-comments](#lean-comments) | Comments worth keeping |
| [lean-scripts](#lean-scripts) | Scripts worth keeping |

Haiku reviews are gated in code first, so a call that cannot fail the review
costs no model call. End-of-turn checks read the git diff of repos the turn
touched, Bash edits included, and send at most two follow-up prompts a session.

### git-gates

Pushing is a deploy, so the agent needs the user's word in their latest typed
message. If a consent check itself fails, the call is blocked.

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| consent | git commit, push; PR/MR merge | commit, push, ship, deploy, pr or mr in the latest message; merge needs "merge"; a protected branch must be named | Call denied |
| grants | Later commits in the session | A message asking for a commit per task, or the grant tool after an authorizing message | Commits spend the grant; pushes never |
| messages | A git commit | Conventional Commits subject, no reviewer pre-answers; then Haiku: a body only when the cause is subtle | Commit denied |
| descriptions | Setting an MR/PR description | Fixed-label blocks at column 0 | Call denied |

Protected branches come from a repo's own push policy file.

### lean-docs

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| docs-review | A doc grown in a git checkout | Haiku: text nobody reads after the task (runbooks, setup pages, narration) | Claude gets the reason |
| docs-no-repeat-code | A doc line being written | Identifiers that already appear together in one code file | Write denied |
| limit-docs | The end of a turn | New or grown docs, prose outweighing code, doc lines repeating code | Follow-up prompt |

### lean-comments

No comments by default: keep the ones that record a measured number, a trap or
an invariant, cut the ones that restate the code or narrate the change.

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| limit-edits | A Write or Edit | More than 3 added comment lines, or a comment-heavy region around the edit | Claude gets the guidance |
| limit-turns | The end of a turn | More than 3 new comment lines per file in the turn's diff | Follow-up prompt |

### lean-scripts

| Check | Runs on | Flags | Then |
| --- | --- | --- | --- |
| scripts-review | A script written or grown in a git checkout | Haiku: scripts you could just type again when needed | Claude gets the reason |

## Install

Mods load only with function hooks enabled, so export this in your shell profile first:

```sh
export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
```

Without it Claude Code skips the mods silently. Then, in Claude Code:

```
/plugin marketplace add bahaospanov/claude-mods
/plugin install <mod>@bahaospanov
```

## Develop

One folder per mod. `tsconfig.json` and `types/` are shared. An installed mod
carries only its own folder, so code two mods share is copied into each one's
`hooks/shared/`.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./<mod> --debug
```

Saving a file under `<mod>/hooks/` reloads the mod. Repeat `--plugin-dir` to
load several.

## Check

```sh
npm run typecheck                 # tsc over every mod and its tests
npm run check:shared              # hooks/shared/ copies are identical across mods
claude plugin validate ./<mod>    # what the engine sees the module hook and call
claude plugin test ./<mod>        # the mod's tests/
```

## Types

`types/` is written by `/plugin-types types`, run inside a session started as
above. Regenerate, never edit, when:

- Claude Code updates (`head -1 types/claude-code.d.ts` vs `claude --version`)
- a plugin that adds to `$` is enabled or disabled
- an MCP server is connected or disconnected

Commit the result; `git diff types/` shows what the update changed.
