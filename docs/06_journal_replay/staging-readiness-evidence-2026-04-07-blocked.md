# Staging Readiness Evidence - 2026-04-07 (blocked)

Scope: current-session record for the staged readiness checklist.  
Authority: historical evidence only; non-canonical for architecture or runtime truth.

## Purpose

Record the real checks attempted in this session and preserve the exact blocker state without implying readiness.

## Run Metadata

- Date: `2026-04-07`
- Operator: `Codex desktop session`
- Commit SHA: `cf2b97b4000bc93e70069433587f965e8cceeefe`
- Environment identifiers:
  - `bobbyexecute-bot-staging.onrender.com`
  - `bobbyexecute-control-staging.onrender.com`
  - `bot/` workspace-local command environment

## Check Results

| Check | Command or URL | Executed | Result | Evidence captured | Blocker |
|---|---|---:|---|---|---|
| GET /health | `https://bobbyexecute-bot-staging.onrender.com/health` | yes | success | HTTP `200 OK`; body reported `status:"DEGRADED"`, `botStatus:"running"`, `runtime.mode:"dry"`, `readiness.liveAllowed:false`, `rolloutPosture:"paper_only"`, and `readiness.blockers:[{"code":"rollout_paper_only","scope":"micro_live","message":"Micro-live is not allowed while rollout posture is paper_only."}]` | Public staging bot is reachable, but it is not in live-ready posture. |
| GET /control/status | `https://bobbyexecute-control-staging.onrender.com/control/status` | yes | blocked | HTTP `404 Not Found` from the public host. | Control service is not publicly reachable from this session. |
| GET /control/release-gate | `https://bobbyexecute-control-staging.onrender.com/control/release-gate` | yes | blocked | HTTP `404 Not Found` from the public host. A direct `:10000` probe then timed out after `15015ms` with `curl: (28) Connection timed out`. | Private control plane remains unreachable from this session. |
| recovery:worker-state | `npm --prefix bot run recovery:worker-state` | yes | success | JSON report returned `status:"ready"`, `safeBoot:true`, `bootCriticalMissing:[]`, `bootCriticalInvalid:[]`. The only recovery gap was `data/journal.execution-evidence.jsonl`, which the script marked as non-boot-critical. | This was a workspace-local recovery drill, not a remote staging-host proof. |
| live:preflight | `npm --prefix bot run live:preflight` | yes | blocked | Command completed `premerge` and `build`, then failed closed with `Live-test preflight requires LIVE_TRADING=true.` The generated file `bot/data/journal.live-preflight.json` was updated with `capturedAt:"2026-04-07T05:13:06.033Z"` and `status:"blocked"`. | The session did not have a real staged live overlay; the command ran in the workspace and failed closed. |
| recovery:db-rehearse | `npm --prefix bot run recovery:db-rehearse` | yes | blocked | Command exited with `source database URL is required.` | No target staging database URL or rehearsal access was available in this session. |

## Verified Interpretation

- The staging bot health surface is reachable and currently reports dry-mode, paper-only posture.
- The control plane is still not reachable from this session over the public host, and the private-network probe timed out.
- The local worker-state drill is healthy, but it does not substitute for a target-environment rehearsal.
- Live preflight remains blocked in this session because the required live overlay is absent.
- Database rehearsal could not be run because the source database URL was unavailable.

## Result

- Status: blocked
- Exact blocker: current session lacks verified target-environment access for the private control plane and database rehearsal, and the workspace-local live preflight still fails closed without `LIVE_TRADING=true`.

