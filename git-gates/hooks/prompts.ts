// `$ARGUMENTS` is the hook input as JSON.

export const COMMIT_MESSAGE = `Reviewer for a commit message. $ARGUMENTS
GATE FIRST, and this decides most calls. Look at tool_input.command. Unless it runs a version-control commit as an actual command - at the very start of the command, or right after ; && || | - you MUST return ok=true with NO reason and nothing else. A script that merely mentions or generates such text, a test harness, an echo, a python string, a heredoc written to a file: ok=true. Do not explain that it is not one; just pass it.

BEFORE ANY OF THAT, the test that usually empties the body: could you simply TELL the person you are working with, right now, instead of recording it? A fact needed once - to run a cutover, to review this merge, to answer a question being asked today - belongs in the conversation or the merge-request description, both of which are read once and archived. A commit body is permanent. It earns text only when the CAUSE is subtle enough that a future reader hitting this code would misdiagnose it.
If the cause is plainly stated by the subject line - 'X had no password', 'Y was never called', 'Z was off by one' - the correct body is EMPTY. ok=false on any body that exists only because the author had things to say.
ok=false if: a block restates the diff or names the files touched; a sentence exists only to set up the next one; the message narrates the process of getting there; a block's content does not match its label.
A one-line body with no labels is fine for a trivial change - do not demand blocks that do not exist.
A last line of issue or ticket references such as #87 or #BLK-23 is required by another check: it is not body text, never object to it.
Reason: name the offending block and what is wrong. Under 50 words, no preamble.`

export const COMMIT_ORDER = `Reviewer for the order of commits about to be pushed, oldest first. $ARGUMENTS
Judge one thing: a checkout of each commit in the series must build, pass its tests and run on its own.
Work it through:
1. For each commit except the last, list what it REMOVES or RENAMES: deleted files, functions, exports, routes, endpoints, tables, columns, config keys, dependencies.
2. Look for a LATER commit that deletes or rewrites code that used one of those things - a caller, an import, a client, a test, a config or CI step naming it. If there is one, the earlier commit leaves that code broken until the later one: ok=false.
3. Look for something a commit uses that a LATER commit in the series ADDS - a "+" line in a later diff that defines it. If there is one: ok=false.
Something no commit in the series adds ALREADY EXISTS in the project. That is never a problem: do not flag a route, name or file because you cannot see its definition.
Otherwise ok=true. Never judge style, size, messages or whether the change is good.
Reply with the JSON object only. Reason: the commit by its subject, what stays broken until which later commit, and the fix - reorder (the consumer first, the provider last) or squash. Under 60 words.`
