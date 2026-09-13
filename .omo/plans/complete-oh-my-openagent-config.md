# complete-oh-my-openagent-config - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** OpenCode Desktop will load the oh-my-openagent plugin and show its features (Sisyphus ultraworker agent, `/ultrawork` command, Roles/Models panel).

**Why this approach:** The plugin is already installed and configured, but OpenCode doesn't know which agent to use as the main one. Setting the plugin's primary agent `sisyphus` as the default tells OpenCode to activate the plugin on startup; a full Desktop restart is required because OpenCode does not hot-reload config.

**What it will NOT do:** It will not change the Galide project code, reinstall the plugin, or switch model providers/API keys.

**Effort:** Quick
**Risk:** Low - one config key is added, a backup is created first, and JSON syntax is validated before restart.
**Decisions to sanity-check:** Confirm you are okay with `sisyphus` as the default agent (the plugin's main ultraworker) and that you can fully quit and restart OpenCode Desktop.

Your next move: start work now, or run a high-accuracy review first. Full execution detail follows below.

---

> TL;DR (machine): Quick, Low risk: add `default_agent: "sisyphus"` to OpenCode config, restart Desktop, verify plugin features.

## Scope
### Must have
- Add `default_agent: "sisyphus"` to `~/.config/opencode/opencode.json` so OpenCode loads oh-my-openagent's primary agent on startup.
- Validate that `opencode.json` remains syntactically valid and schema-compliant after the change.
- Confirm the plugin package `oh-my-openagent@latest` is installed and resolvable.
- Provide exact user-facing steps to fully restart OpenCode Desktop and reload config.
- Verify after restart that plugin-visible features appear: Sisyphus agent selector, `/ultrawork` (or `/ulw`) command, Roles/Models panel.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Do NOT change the project code under `/Users/lipunima/projects/galide`; this is strictly OpenCode configuration.
- Do NOT uninstall or reinstall the plugin unless validation proves it is missing or corrupted.
- Do NOT modify model provider credentials (Kimi/MiniMax API keys) or network proxy settings.
- Do NOT rewrite `oh-my-openagent.json` unless it fails schema validation; current agent/category overrides are correct.

## Verification strategy
> Config editing and file validation are agent-executed; the OpenCode Desktop restart and UI verification require human action because the agent cannot directly interact with the macOS Dock/menu bar.
- Test decision: none (config-only change). Agent verification is via file reads, JSON syntax checks, and `opencode doctor` if available.
- Evidence: `.omo/evidence/task-<N>-complete-oh-my-openagent-config.<ext>` plus a final snapshot of the modified `opencode.json`.
- Every config edit must be preceded by a timestamped backup and followed by `python3 -m json.tool` validation. If `jsonschema` or `opencode doctor` is unavailable, the fallback is JSON syntax check plus manual schema field verification.
- Load the `customize-opencode` skill before any config edit to ensure schema/location best practices are followed.

## Execution strategy
### Parallel execution waves
Wave 1 - Config fix and validation (sequential because each step depends on the previous file state):
- 1: Backup, verify Desktop is quit, verify plugin is registered, and add `default_agent: "sisyphus"` to `~/.config/opencode/opencode.json`.
- 2: Validate `opencode.json` schema and semantics after adding `default_agent`.
- 3: Confirm plugin package is installed and exposes the `sisyphus` agent.

Wave 2 - User action and verification (4 requires user action, 5 runs after 4):
- 4: User fully quits and restarts OpenCode Desktop.
- 5: Verify plugin features visible in the restarted Desktop UI.

Wave 3 - Fallback (only if 5 fails):
- 6: Inspect Desktop logs and plugin load errors to determine next fix.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1 | - | 2 | - |
| 2 | 1 | 4 | 3 |
| 3 | - | 4 | 2 |
| 4 | 1, 2, 3 | 5 | - |
| 5 | 4 | - | - |
| 6 | 5 | - | - |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->
- [ ] 1. Backup `opencode.json`, verify Desktop is quit, and add `default_agent: "sisyphus"`
  What to do / Must NOT do: Verify `~/.config/opencode/opencode.json` exists and is writable (`test -f` and `test -w`). Ensure OpenCode Desktop is fully quit using `ps aux | grep -iE "opencode|ai\.opencode\.desktop" | grep -v grep` (must return empty, including helper processes). Create a timestamped backup of `~/.config/opencode/opencode.json` to `~/.config/opencode/opencode.json.backup-<iso>`. Verify the `plugin` field is a JSON array containing the string `"oh-my-openagent"`. Then insert `"default_agent": "sisyphus"` at the top-level object. Preserve `$schema`, `model`, `provider`, and `plugin` fields exactly. If `default_agent` already exists with a different value, overwrite with `sisyphus` and record the old value in evidence. Must NOT edit while the Desktop process is running. Must NOT remove or alter existing fields. Must NOT nest `default_agent` inside `provider` or `plugin`.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 2
  References (executor has NO interview context - be exhaustive): `~/.config/opencode/opencode.json` (current content from session transcript); `customize-opencode` skill notes on `default_agent`, config paths, and the need to restart after changes; plugin `dist/cli-node/index.js` maps `omo`, `OmO`, and `Sisyphus` aliases to `"sisyphus"`; opencode schema `https://opencode.ai/config.json` field `default_agent`.
  Acceptance criteria (agent-executable): File exists and is writable; no OpenCode-related process is running; backup file exists; `plugin` array contains `"oh-my-openagent"`; after edit, `python3 -m json.tool ~/.config/opencode/opencode.json` exits 0 and the file contains `"default_agent"` with value `"sisyphus"`.
  QA scenarios (name the exact tool + invocation): happy - file exists/writable, `pgrep` returns empty, backup created, JSON syntax valid; failure - file missing or not writable → abort; failure - Desktop still running → instruct user to quit before proceeding; failure - JSON syntax error → restore from backup. Evidence `.omo/evidence/task-1-complete-oh-my-openagent-config.txt` and `.omo/evidence/opencode.json.snapshot.before`.
  Commit: N

- [ ] 2. Validate `opencode.json` schema and semantics after adding `default_agent`
  What to do / Must NOT do: Fetch `https://opencode.ai/config.json` and confirm `default_agent` is a recognized top-level property and that `sisyphus` is a valid agent value (or rely on the prior plugin manifest inspection). Run `opencode doctor` if available and ensure it does not report `ConfigInvalidError`. If `jsonschema` is available, validate the file against the fetched schema. Must NOT skip validation. Must NOT proceed to 4 if validation fails. If schema tools are unavailable, perform a manual field check (top-level keys are valid, no unknown fields introduced, `default_agent` value is a string) and record the limitation.
  Parallelization: Wave 1 | Blocked by: 1 | Blocks: 4
  References (executor has NO interview context - be exhaustive): `~/.config/opencode/opencode.json` (post-edit); `https://opencode.ai/config.json` (fetch for validation); `customize-opencode` skill schema validation guidance; plugin manifest confirming `sisyphus` agent.
  Acceptance criteria (agent-executable): `opencode doctor` (if available) exits without `ConfigInvalidError`; `jsonschema` validation (if available) passes; manual field check confirms `default_agent` is a string at the top level and no unknown keys were added. Final `opencode.json` snapshot is saved as evidence.
  QA scenarios (name the exact tool + invocation): happy - `opencode doctor` (or `jsonschema`) passes; failure - `ConfigInvalidError` → restore from backup and stop. Evidence `.omo/evidence/task-2-complete-oh-my-openagent-config.txt` and `.omo/evidence/opencode.json.snapshot.after`.
  Commit: N

- [ ] 3. Confirm `oh-my-openagent@latest` plugin package is installed and exposes `sisyphus`
  What to do / Must NOT do: Check that `~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/package.json` exists and has a `version` field. Also verify the plugin's agent list includes `sisyphus` (e.g., by grepping `dist/cli-node/index.js` for the canonical agent list or alias map). Must NOT reinstall if already present.
  Parallelization: Wave 1 | Blocked by: - | Blocks: 4
  References (executor has NO interview context - be exhaustive): `~/.cache/opencode/packages/oh-my-openagent@latest/package.json` (dependency wrapper); `~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/package.json` (actual plugin); `~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/cli-node/index.js` (agent aliases); `~/.config/opencode/package.json` dependencies.
  Acceptance criteria (agent-executable): `jq -r '.version' ~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/package.json` returns a non-empty version string; and `grep -o '"sisyphus"' ~/.cache/opencode/packages/oh-my-openagent@latest/node_modules/oh-my-openagent/dist/cli-node/index.js | head -1` finds at least one occurrence.
  QA scenarios (name the exact tool + invocation): happy - version string and `sisyphus` occurrence found; failure - package missing or `sisyphus` not found → run `opencode plugin install oh-my-openagent@latest` (or equivalent) and re-verify. Evidence `.omo/evidence/task-3-complete-oh-my-openagent-config.txt`.
  Commit: N

- [ ] 4. Instruct user to fully quit and restart OpenCode Desktop
  What to do / Must NOT do: Tell the user to use Command-Q / "Quit OpenCode" from the menu, wait 5 seconds, then reopen the app. Must NOT rely on closing the window or minimizing to tray. Must NOT restart automatically (agent cannot click the Dock).
  Parallelization: Wave 2 | Blocked by: 1, 2, 3 | Blocks: 5
  References (executor has NO interview context - be exhaustive): `customize-opencode` skill: "Config is loaded once when opencode starts and is not hot-reloaded. After saving changes... tell the user to quit and restart opencode."
  Acceptance criteria (agent-executable): User confirms they have fully quit and reopened OpenCode Desktop (message in chat). If the user does not confirm, the agent provides explicit written restart instructions and stops; do NOT proceed to 5.
  QA scenarios (name the exact tool + invocation): happy - user confirms restart; failure - user does not respond → agent leaves instructions and stops. Evidence `.omo/evidence/task-4-complete-oh-my-openagent-config.txt` (screenshot or user confirmation).
  Commit: N

- [ ] 5. Verify plugin features appear in OpenCode Desktop after restart
  What to do / Must NOT do: Check the UI for Sisyphus agent selector, `/ultrawork` or `/ulw` command, or Roles/Models panel. Must NOT declare success if only the old `build` agent is visible. If agent cannot see the UI, ask the user to confirm one of the three features. Capture the final `opencode.json` content as evidence.
  Parallelization: Wave 2 | Blocked by: 4 | Blocks: -
  References (executor has NO interview context - be exhaustive): Plugin README/skills mention `/ultrawork` and `/ulw`; transcript shows expected features: Sisyphus scheduler, Roles/Models panel.
  Acceptance criteria (agent-executable): At least one of the following is confirmed: (a) user can select "Sisyphus" or "Sisyphus - Ultraworker" as the active agent; (b) typing `/ultrawork` or `/ulw` is recognized; (c) a Roles/Models section appears in the UI. Final `opencode.json` snapshot is saved as evidence.
  QA scenarios (name the exact tool + invocation): happy - Sisyphus/ultrawork/Roles visible and snapshot saved; failure - none visible → proceed to 6. Evidence `.omo/evidence/task-5-complete-oh-my-openagent-config.png` and `.omo/evidence/opencode.json.snapshot.final`.
  Commit: N

- [ ] 6. Fallback: inspect Desktop logs and plugin load errors if features still missing
  What to do / Must NOT do: Read `~/Library/Application Support/ai.opencode.desktop/logs/<latest>/` and search for `oh-my-openagent`, `plugin`, `ConfigInvalidError`, or `Error`. Must NOT perform random config changes; diagnose first. If no clear fix is identified, restore the original config from the timestamped backup and instruct the user to restart again, then report the failure.
  Parallelization: Wave 3 | Blocked by: 5 | Blocks: -
  References (executor has NO interview context - be exhaustive): `~/Library/Application Support/ai.opencode.desktop/logs/`; `~/Library/Application Support/ai.opencode.desktop/opencode.global.dat` (for last startup timestamp); `customize-opencode` skill escape hatches `OPENCODE_DISABLE_DEFAULT_PLUGINS=1` and `OPENCODE_PURE=1`; backup file at `~/.config/opencode/opencode.json.backup-<iso>`.
  Acceptance criteria (agent-executable): Produce a concise log summary with the most recent plugin-related error and a recommended next step; if no clear error, restore the backup and report the rollback. Save the final `opencode.json` snapshot if not already saved in 5.
  QA scenarios (name the exact tool + invocation): happy - identify a clear error and next fix; failure - no obvious error → restore from backup and report. Evidence `.omo/evidence/task-6-complete-oh-my-openagent-config.txt`.
  Commit: N

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance audit - Confirm all todos executed and evidence files exist under `.omo/evidence/` (including `opencode.json.snapshot.before`, `opencode.json.snapshot.after`, and `opencode.json.snapshot.final`).
- [ ] F2. Code quality review - N/A (no project code changed); confirm no accidental edits to `/Users/lipunima/projects/galide`.
- [ ] F3. Real manual QA - User confirms Sisyphus agent or `/ultrawork` command is visible in OpenCode Desktop after restart.
- [ ] F4. Scope fidelity - Confirm only `~/.config/opencode/opencode.json` was modified; the backup file and `.omo/evidence/` are expected; no other project files changed.

## Commit strategy
No git commits required. This plan modifies only `~/.config/opencode/opencode.json` (global OpenCode configuration outside the project). Before editing, create a timestamped backup at `~/.config/opencode/opencode.json.backup-<iso>`. Keep the backup until the user confirms the plugin works. Save config snapshots to `.omo/evidence/opencode.json.snapshot.{before,after,final}`. Rollback command: `cp ~/.config/opencode/opencode.json.backup-<iso> ~/.config/opencode/opencode.json`.

## Success criteria
- `~/.config/opencode/opencode.json` contains `"default_agent": "sisyphus"` and passes JSON/schema validation.
- OpenCode Desktop is fully restarted and reloads the configuration.
- After restart, the plugin's primary features are visible: Sisyphus agent selector, `/ultrawork` (or `/ulw`) command, or Roles/Models panel.
- If features are still missing, a clear log-based diagnosis is provided and the next troubleshooting step is identified.
