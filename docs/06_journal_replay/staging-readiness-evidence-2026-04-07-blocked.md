# Staging Readiness Evidence - 2026-04-07 (blocked)

Scope: current-session record for the staged readiness checklist.  
Authority: historical evidence only; non-canonical for architecture or runtime truth.

## Purpose

Record the real checks attempted in this session and preserve the exact blocker state without implying readiness.

## Run Metadata

- Date: `2026-04-07`
- Operator: `Codex desktop session`
- Commit SHA: `347dd13`
- Environment identifiers:
  - `bobbyexecute-bot-staging.onrender.com`
  - `bobbyexecute-control-staging.onrender.com`
  - `bot/` workspace-local command environment

## Check Results

| Check | Command or URL | Executed | Result | Evidence captured | Blocker |
|---|---|---:|---|---|---|
| GET /health | `https://bobbyexecute-bot-staging.onrender.com/health` | yes | success | HTTP `200 OK`; body reported `status:"DEGRADED"`, `botStatus:"running"`, `runtime.mode:"dry"`, `readiness.liveAllowed:false`, `rolloutPosture:"paper_only"`, and `readiness.blockers:[{"code":"rollout_paper_only","scope":"micro_live","message":"Micro-live is not allowed while rollout posture is paper_only."}]` | Public staging bot is reachable, but it is not in live-ready posture. |
| GET /control | `https://bobbyexecute-dashboard-staging.onrender.com/control` | yes | success | HTTP `200 OK`; the dashboard control page is publicly served and renders a client-side control shell. | This is the intended public operator surface for control, not the private `bobbyexecute-control-staging` host. |
| GET /api/control/status | `https://bobbyexecute-dashboard-staging.onrender.com/api/control/status` | yes | blocked | HTTP `500 Internal Server Error` from the dashboard proxy route. The response arrived in about `0.4s`, which is fast enough to indicate a pre-upstream proxy exception rather than a private-host timeout. | The dashboard proxy is failing before it can return a private-control response; the proxy code requires a configured dashboard control token and internal control-service wiring. |
| GET /api/control/release-gate | `https://bobbyexecute-dashboard-staging.onrender.com/api/control/release-gate` | yes | blocked | HTTP `500 Internal Server Error` from the dashboard proxy route. The response arrived in about `0.4s`, matching the same fast pre-upstream failure class as `/api/control/status`. | The dashboard proxy is failing before it can return a private-control response; the proxy code requires a configured dashboard control token and internal control-service wiring. |
| GET /control/status | `https://bobbyexecute-control-staging.onrender.com/control/status` | yes | blocked | HTTP `404 Not Found` from the public host. | The private control service is not publicly exposed at this host; the public access path is the dashboard proxy. |
| GET /control/release-gate | `https://bobbyexecute-control-staging.onrender.com/control/release-gate` | yes | blocked | HTTP `404 Not Found` from the public host. A direct `:10000` probe then timed out after `15015ms` with `curl: (28) Connection timed out`. | The private control service remains unreachable from this session over the direct host/port path. |
| recovery:worker-state | `npm --prefix bot run recovery:worker-state` | yes | success | JSON report returned `status:"ready"`, `safeBoot:true`, `bootCriticalMissing:[]`, `bootCriticalInvalid:[]`. The only recovery gap was `data/journal.execution-evidence.jsonl`, which the script marked as non-boot-critical. | This was a workspace-local recovery drill, not a remote staging-host proof. |
| live:preflight | `npm --prefix bot run live:preflight` | yes | blocked | Command completed `premerge` and `build`, then failed closed with `Live-test preflight requires LIVE_TRADING=true.` The generated file `bot/data/journal.live-preflight.json` was updated with `capturedAt:"2026-04-07T05:13:06.033Z"` and `status:"blocked"`. | The session did not have a real staged live overlay; the command ran in the workspace and failed closed. |
| recovery:db-rehearse | `npm --prefix bot run recovery:db-rehearse` | yes | blocked | Command exited with `source database URL is required.` | This local shell lacks the staging rehearsal context; target rehearsal evidence is already captured separately in `staging-db-rehearsal-evidence-2026-04-07-success.md`. |

## Post-Fix Target Rerun

After committing and pushing the minimal proxy/live-overlay wiring fix to `main`, the target staging surfaces were probed again and still reflected the old blocked state.

| Check | Command or URL | Executed | Result | Evidence captured | Blocker |
|---|---|---:|---|---|---|
| GET /health | `https://bobbyexecute-bot-staging.onrender.com/health` | yes | success | HTTP `200 OK`; body still reported `status:"DEGRADED"`, `runtime.mode:"dry"`, `rolloutPosture:"paper_only"`, and `readiness.liveAllowed:false`. Probe timestamp: `2026-04-07T06:47:16Z`. | The deployed staging bot had not yet reflected the live-overlay fix or remained on the pre-change rollout posture. |
| GET /api/control/status | `https://bobbyexecute-dashboard-staging.onrender.com/api/control/status` | yes | blocked | HTTP `500 Internal Server Error`. Probe timestamp: `2026-04-07T06:47:17Z`. | The dashboard control proxy still failed fast, so the control surface was not yet proving upstream readiness. |
| GET /api/control/release-gate | `https://bobbyexecute-dashboard-staging.onrender.com/api/control/release-gate` | yes | blocked | HTTP `500 Internal Server Error`. Probe timestamp: `2026-04-07T06:47:17Z`. | Same fast proxy failure class as `/api/control/status`. |

## Verified Interpretation

- The staging bot health surface is reachable and currently reports dry-mode, paper-only posture.
- The public control surface is the dashboard proxy (`/api/control/*`), not the private service host.
- The dashboard proxy returned fast `500` responses for `GET /api/control/status` and `GET /api/control/release-gate` in this session, which is consistent with a dashboard-side proxy exception before any upstream control response is available.
- The private control service host still returns `404` on public probes, and the direct `:10000` probe timed out.
- The local worker-state drill is healthy, but it does not substitute for a target-environment rehearsal.
- Live preflight remains blocked in this session because the required live overlay is absent.
- Database rehearsal is already evidenced separately by `staging-db-rehearsal-evidence-2026-04-07-success.md`; the local shell failure here is only a missing staging rehearsal context, not the target proof surface.
- Inference: before the fix was pushed, the staging blueprint expressed paper-only/dry defaults in `render.yaml`; after the fix was pushed, the target services still reported the pre-change blocked posture at the time of the rerun, so the deployment had not yet cut over or had not yet applied the new env wiring.

## Result

- Status: blocked
- Exact blocker: the dashboard control proxy is still failing fast before it can return upstream control data, and the target staging services still reported the old paper-only/dry posture after the minimal fix was pushed.
