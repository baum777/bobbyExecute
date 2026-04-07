# Control Endpoint Accessibility Evidence — 2026-04-07 (blocked)

Scope: captures the attempts to exercise `GET /control/status` and `GET /control/release-gate` for the staging control plane that is private to Render.
Authority: historical record of blocked attempts; the control plane remains unreachable from this session.

## Attempts
1. `curl -H "Authorization: Bearer operator-read-token-2026" https://bobbyexecute-control-staging.onrender.com/control/status`
   - Result: `Not Found` (HTTP 404). The publicly resolvable host does not expose the control routes, confirming the service is private.
2. `curl -H "Authorization: Bearer operator-read-token-2026" https://bobbyexecute-control-staging.onrender.com:10000/control/status`
   - Result: connection timed out after ~14s. Access from this network is blocked by Render private networking (the port is not routable from outside the workspace).
3. Render API job creation attempt to the control service (`POST https://api.render.com/v1/services/srv-d7526d9r0fns73d5tohg/jobs` with a `curl` script) returned `Unauthorized`.
   - Signal: the available `RENDER_API_KEY` lacks the `jobs` scope for that private service, so we cannot spin up a Render job to reach localhost from inside the network.

## Blocker
- The control pod within Render staging is accessible only via Render’s private network or via guarded job runs. Without an owner-level API key or internal access we cannot fetch `GET /control/status` and `/control/release-gate` from this session.
- Evidence: the `curl` commands above and the `Unauthorized` job creation response, plus the controlled `RENDER_API_KEY` gating, document the blocked state.
