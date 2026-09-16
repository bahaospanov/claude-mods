# bahaospanov

Bakhtiyar Ospanov's Claude Code mods: plugins built on function hooks. Early access; the API
changes between releases.

## Mods

| Mod | What it does |
| --- | --- |
| [lean-repo](#lean-repo) | Keeps one-time docs, on-demand scripts and diff-restating commit bodies out of the repo. |
| [git-gates](#git-gates) | Gates git work: no commit, push or merge without the user's say-so; commit messages and MR descriptions kept tidy. |

### lean-repo

Haiku reviews the text that rots. Calls that don't qualify are skipped in code
([gates.ts](lean-repo/hooks/gates.ts)); prompts in
[prompts.ts](lean-repo/hooks/prompts.ts).

| Review | Runs on | Rejects | Then |
| --- | --- | --- | --- |
| Docs | Doc file grown in a git checkout | One-time runbooks, setup pages, narration, facts stated elsewhere | Claude gets the reason |
| Scripts | Script written or grown in a git checkout | Scripts you could just type again when needed | Claude gets the reason |
| Commit messages | A git commit | Bodies that restate the diff or narrate | Commit denied |

### git-gates

Pushing is a deploy, so the agent needs the user's word in their latest typed
message. Checks run in code, no model calls; if a check itself fails, the call
is blocked.

| Check | Runs on | Needs | Then |
| --- | --- | --- | --- |
| Consent | git commit, push; PR/MR merge | commit, push, ship, deploy, pr or mr in the latest message; merge needs "merge"; a protected branch must be named | Call denied |
| Commit grants | Later commits in the session | A message asking for a commit per task, or the grant tool after an authorizing message | Commits spend the grant; pushes never |
| Commit message | A git commit | Conventional Commits subject, no reviewer pre-answers | Commit denied |
| MR description | Setting an MR/PR description | Fixed-label blocks at column 0 | Call denied |

Protected branches come from a repo's own push policy file.

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

One folder per mod. `tsconfig.json` and `types/` are shared.

```sh
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./<mod> --debug
```

Saving a file under `<mod>/hooks/` reloads the mod. Repeat `--plugin-dir` to
load several.

## Check

```sh
npm run typecheck                 # tsc over every mod and its tests
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
