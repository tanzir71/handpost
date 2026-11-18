# Automating Handpost with Claude, Claude Code and Codex

Handpost never calls an AI and no AI ever calls a platform. The only interface is the folder described in [`INBOX_PROTOCOL.md`](INBOX_PROTOCOL.md): writers drop files into `~/Handpost/inbox/`, Handpost publishes and writes receipts. This page shows the three supported ways to put a writer on a schedule. Settings → Automation in the app links here and offers a copyable prompt.

> Every writer that can write to `inbox/` can publish to your connected accounts. Auto-schedule starts **off**: every file waits in the Inbox screen for your approval until you turn it on (Handpost explains this once before it does). Keep it off until you trust a task's output, or have the task use `mode: review`.

## A. Claude scheduled task (recommended)

Best when the Claude desktop app is open on the same computer as Handpost.

1. Add the skill: `integrations/claude/handpost-inbox/SKILL.md` (save it as a skill in Claude). Handpost also keeps a copy in your Handpost folder as `HANDPOST_WRITER.md`.
2. Create a scheduled task in Claude that runs **on this computer** and has the **Handpost folder** (not just `inbox/`) attached, so it can read `handpost.status.json` and `receipts/`.
3. Prompt template:

   > Every weekday at 08:30, draft tomorrow's post for X, LinkedIn and Bluesky about <topic> and drop it in my Handpost inbox using the handpost-inbox skill. Read handpost.status.json first, only use connected platforms, don't repeat anything from the last 14 days, and use mode: review for anything that mentions a person or a company. Then read the receipts of yesterday's ids and tell me what was published.

   Settings → Automation → **Copy prompt** gives you this text with your real folder path filled in.

4. The task's first run should leave a file in `inbox/` that moves to `processed/` within a minute, and a `receipts/<id>.json`. Settings → Automation → **Writers seen** lists every source that has written files.

## B. Claude Code, headless, on an OS schedule

For people who prefer their own scheduler. Run Claude Code in print mode from inside the Handpost folder with only file tools allowed (verify flag names with `claude --help` for your version):

```sh
cd ~/Handpost && claude -p "Use the instructions in ./HANDPOST_WRITER.md to write today's post." \
  --allowedTools "Read,Write,Edit,Bash(mkdir:*),Bash(mv:*)"
```

- macOS/Linux: a `cron` or `launchd` entry.
- Windows: Task Scheduler → Action `powershell -NoProfile -Command "cd $env:USERPROFILE\Handpost; claude -p '…'"`.
- Handpost writes `HANDPOST_WRITER.md` (a copy of the skill) into the Handpost folder on first run so headless tools have the rules locally.

## C. Codex CLI

Codex reads `AGENTS.md` in its working directory. Copy `integrations/codex/AGENTS.md` into the Handpost folder (Settings → Automation → **Copy AGENTS.md into Handpost folder** does it for you), then schedule:

```sh
cd ~/Handpost && codex exec "Write today's release-notes post for X and LinkedIn following AGENTS.md."
```

(Verify the non-interactive subcommand with `codex --help`.)

## D. Cloud-only writers

Writers that run in the cloud and can't see your disk (a cloud-run Claude task, a GitHub Action, Codex cloud) push files to a Git repository's `inbox/` folder instead; enable Settings → Automation → Remote source with that repository. Handpost pulls every 5 minutes. A synced folder (Dropbox, OneDrive, Google Drive) chosen as the Handpost folder also works — turn off “Include post text in status file” if you don't want previews synced.

## E. Local MCP server (optional)

For tools that prefer MCP tools over writing files, the repository includes `handpost-mcp`, a small stdio server. It does nothing a file-writing writer couldn't: it validates a post against the protocol, drops it into `inbox/` atomically, writes cancel files, and reads `receipts/` and `handpost.status.json`. It never talks to the app, a browser or the network, so every guardrail of the inbox still applies.

Build it once from a checkout (`npm run build` produces `dist/mcp/server.cjs`), then register it with your MCP client — for Claude Code, for example:

```sh
claude mcp add handpost -- node /path/to/handpost/dist/mcp/server.cjs --folder ~/Handpost
```

(Verify the subcommand with `claude mcp --help` for your version; for other clients, run the same `node … --folder …` command as a stdio server.) Tools: `handpost_status`, `handpost_write_post`, `handpost_cancel`, `handpost_receipt`, `handpost_list_receipts`.

## F. Fixing broken selectors with Claude

When a platform changes its page and a step stops finding its element, Handpost saves a report and a privacy-reduced page snapshot under `selectors/reports/` in the Handpost folder. Accounts → *platform* → **Selectors** → **Copy prompt for Claude** gives a prompt that points Claude at that report and at `selectors/README.md` (the [handpost-selectors skill](../integrations/claude/handpost-selectors/SKILL.md)); Claude writes a fix to `selectors/proposed/<platform>.json`, and you check it against the snapshot, rehearse with it and apply it in the same dialog. A proposal changes nothing until you apply it. Details: [SELECTORS.md](SELECTORS.md).

## Checking that it works

| Symptom | Look at |
|---|---|
| File never leaves `inbox/` | Handpost isn't running (check `alive_until` in `handpost.status.json`), the name ends in `.tmp`, or it's inside `inbox/.tmp/`. |
| File moved to `rejected/` | `rejected/<file>.error.json` — codes are listed in INBOX_PROTOCOL §10. |
| `state: duplicate` | The id was already used with identical content: nothing to do. |
| `state: held` | Auto-schedule is off or the file asked for `mode: review` — approve it in the Inbox screen. |
| Target `needs_login` | Log in again in Accounts → posts that stopped there go back into the queue (anything more than two hours late waits in the Queue for you instead). |

## Dry run without any account (developers)

From a checkout of the repository, `npm run inbox:smoke` creates a temporary Handpost folder and database, drops the files from `examples/inbox/` plus one post for the local MockSocial test site, runs the real inbox service and publishing engine against MockSocial only, and prints the receipts. Nothing is sent to a real platform.
