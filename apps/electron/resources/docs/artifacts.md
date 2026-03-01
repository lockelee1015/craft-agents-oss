# Artifact Tracking (`report_artifact`)

This feature adds an explicit "user deliverable" signal to agent workflows.

It is intentionally strict:
- A file is shown as an artifact only if the agent calls `report_artifact`.
- No heuristic detection by extension or filename.
- Intermediate outputs (scripts, temp files, logs, plans) are not artifacts unless explicitly reported.

## Why This Exists

In real tasks, agents often generate helper files before producing the final output.

Example:
- Helper script: `create_pricing_ppt.js`
- Final deliverable: `AI Pricing Deck.pptx`

Users care about the final deliverable, not every intermediate file. This feature makes that distinction explicit and reliable.

## Tool Contract

Session-scoped function call:
- Name: `report_artifact`
- Input parameters:
- `path: string` (required, absolute path or relative to session working directory)
- `title?: string`
- `kind?: "deliverable" | "attachment"` (default: `deliverable`)
- `note?: string`

Validation:
- Path is normalized to an absolute path.
- Target must exist and must be a file.
- Missing files and directories are rejected (no write to store).

## Persistence

Artifacts are stored per session in:
- `<sessionDir>/.artifacts.json`

Shape:

```json
{
  "version": 1,
  "items": [
    {
      "path": "/abs/path/to/file",
      "name": "file.ext",
      "title": "Display Name",
      "kind": "deliverable",
      "note": "Optional note",
      "firstReportedAt": 0,
      "lastReportedAt": 0,
      "lastReportedTurnId": "turn-..."
    }
  ]
}
```

Deduplication:
- Upsert by absolute `path`.
- Re-reporting same path updates metadata and `lastReportedAt`, not a new item.

## UI Behavior

At conversation completion (`complete` event), renderer receives a session-wide artifact snapshot:
- Displayed below the last assistant response.
- One file per card (not a single aggregated list card).
- Hidden when no artifacts exist.

If a previously reported artifact was deleted:
- Record is kept in history.
- Card still appears with `exists=false` / missing state.

## Permission Modes

`report_artifact` is available in all permission modes, including Explore/Safe mode.

This guarantees artifact marking remains usable regardless of the current interaction mode.

## Practical Rule for Agents

Call `report_artifact` only for files intended for user handoff.

Do not report:
- build scripts
- conversion scripts
- temporary files
- logs
- planning markdown files

Report:
- final `.pptx`, `.pdf`, `.csv`, exported deliverables, and user-facing attachments.

## Fork Differentiator

This explicit artifact protocol is a major behavior difference from upstream Craft-style sessions:
- deterministic deliverable tracking
- session-level artifact history
- end-of-flow artifact cards for direct user handoff visibility
