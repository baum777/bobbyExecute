# macOS Inventory

> Source note: this inventory is reconstructed from the repository’s setup, runbooks, environment defaults, and archived manuals. It does **not** include a live macOS system export from the actual MacBook, so machine-specific fields are marked `Needs Verification`.

## 1. Device Baseline

| Item | Status | Notes |
|---|---|---|
| Mac model | Needs Verification | Not accessible from this session. |
| Chip / CPU | Needs Verification | Not accessible from this session. |
| RAM | Needs Verification | Not accessible from this session. |
| Storage | Needs Verification | Not accessible from this session. |
| Serial / device ID | Needs Verification | Do not record here unless manually confirmed on-device. |
| macOS version | Needs Verification | Not accessible from this session. |
| Update state | Needs Verification | Not accessible from this session. |
| Battery health | Needs Verification | Not accessible from this session. |
| Connected accessories / docks | Needs Verification | Not accessible from this session. |

## 2. Account & Access

| Item | Status | Notes |
|---|---|---|
| Primary user account | Needs Verification | Not accessible from this session. |
| Admin vs standard roles | Needs Verification | Not accessible from this session. |
| Apple ID | Needs Verification | Not documented in repo. |
| iCloud services | Needs Verification | Not documented in repo. |
| Login method | Needs Verification | Not documented in repo. |
| Touch ID | Needs Verification | Not documented in repo. |
| FileVault | Needs Verification | Not documented in repo. |
| Recovery options | Needs Verification | Not documented in repo. |
| 2FA | Needs Verification | Not documented in repo. |
| Password manager | Needs Verification | Not documented in repo. |

## 3. System Settings

The repository does not contain a live export of macOS System Settings. The following settings should be inventoried manually:

- General settings
- Desktop & Dock
- Control Center / menu bar customizations
- Trackpad / mouse / keyboard
- Display / scaling / Night Shift / True Tone
- Sound / input / output devices
- Notifications / Focus modes
- Battery / energy settings
- Date / language / region
- Accessibility
- Login items / background items

## 4. Security & Privacy

| Item | Status | Notes |
|---|---|---|
| FileVault | Needs Verification | Verify directly on the Mac. |
| Firewall | Needs Verification | Verify directly on the Mac. |
| Gatekeeper / app install policy | Needs Verification | Verify directly on the Mac. |
| Privacy permissions | Needs Verification | Verify camera, microphone, screen recording, full disk access, accessibility, automation, location, and contacts/calendar/mail access. |
| Screen lock timing | Needs Verification | Verify directly on the Mac. |
| Location services | Needs Verification | Verify directly on the Mac. |
| Sharing settings | Needs Verification | Verify directly on the Mac. |
| Remote login / screen sharing | Needs Verification | Verify directly on the Mac. |
| VPN | Needs Verification | No evidence in repo. |

## 5. Apps & Software Stack

### Verified by repository

These are the confirmed tools and services that define the workstation’s operator model:

| App / Tool | Purpose | Status |
|---|---|---|
| Node.js 22 | Runtime baseline for the bot workspace | Verified |
| npm | Dependency install and script runner | Verified |
| TypeScript | Build and type-checking | Verified |
| Vitest | Test runner | Verified |
| Fastify | API server framework | Verified |
| Pino / Pino Pretty | Logging | Verified |
| Zod | Config validation / schema enforcement | Verified |
| `@solana/web3.js` | Solana integration | Verified |
| `openai` | LLM integration / fallback cascade | Verified |
| `snappyjs` | Memory compression dependency | Verified |
| Dashboard app | Operator UI / runtime truth surfaces | Verified |

### Needs Verification on the actual Mac

- Browser apps installed
- Communication apps installed
- Office/productivity apps installed
- Cloud storage clients installed
- Note-taking / knowledge tools
- Creative tools
- Utility / cleaning tools
- Security tools
- Finance/admin tools
- Startup behavior for all installed apps
- Licensing / subscription ownership

## 6. Files, Folders & Cloud

### Verified repository structure

- `bot/` is the active TypeScript runtime.
- `docs/` contains operational and architecture docs.
- `governance/` is the canonical authority layer.
- `ops/` holds team process artifacts.
- `packages/` contains skill manifests and instructions.
- `dor-bot/` is legacy Python reference code.
- `archive/` contains retired documentation and historical references.

### Verified storage logic

- `JOURNAL_PATH=data/journal.jsonl` is the canonical journal target in the local defaults.
- Render deployment guidance recommends persistent disk for journal and runtime state.

### Needs Verification

- Desktop hygiene
- Downloads hygiene
- Documents hygiene
- iCloud Drive usage
- Dropbox / Google Drive / OneDrive usage
- Local vs cloud folder rules
- Archival structure
- Sync conflict handling

## 7. Browsers & Web Workspace

### Verified behavior

- The dashboard expects a local or deployed API at `http://localhost:3333` by default.
- Mock dashboard mode is enabled by default in `.env.example`.
- The runtime exposes `/health`, `/runtime/status`, `/kpi/*`, `/incidents`, and `/control/*`.

### Needs Verification on the actual Mac

- Default browser
- Browser profiles
- Bookmark organization
- Extension inventory
- Autofill / password handling
- Work vs private profile separation
- Session/tab workflow

## 8. Communication Setup

### Needs Verification on the actual Mac

- Mail accounts
- Calendar accounts
- Contacts sync
- Messages / chat apps
- Meeting tools
- Notification hygiene
- Signatures and account configuration

## 9. Backup, Recovery & Business Continuity

### Verified repository intent

- The bot uses persistent journaling and runtime replay for recoverability.
- Controlled live-test paths are explicitly fail-closed.
- Incident and kill-switch procedures are documented.
- Persistent storage is recommended for journal and control state.

### Needs Verification

- Time Machine status
- External backup status
- Cloud backup dependencies
- Restore readiness
- FileVault recovery key handling
- Critical account recovery dependencies
- Lost / stolen / reset procedure for the actual MacBook

## 10. Performance & Maintenance

### Verified repo/workspace signals

- Node 22 is required.
- The canonical premerge gate is `lint -> golden -> chaos -> integration -> e2e -> config`.
- The repo contains build outputs and caches that can increase storage pressure if kept locally.

### Needs Verification

- Storage pressure on the actual Mac
- Startup load from login items
- Unnecessary background apps
- Update lag
- Battery drain sources
- Network bottlenecks

## 11. Workflow / Operating Logic

The intended operating model is:

1. Start in safe defaults: `LIVE_TRADING=false`, `DRY_RUN=true`, `RPC_MODE=stub`, `TRADING_ENABLED=false`.
2. Run `npm install` in `bot/`.
3. Run `npm run premerge`.
4. Run `npm run build`.
5. Start the API with `npm run start:server`.
6. Use `/health`, `/kpi/summary`, and `/runtime/status` as the first checks.
7. For controlled live-test only, complete preflight and ensure the required tokens and live flags are set.
8. Use `POST /emergency-stop` and `POST /control/reset` for emergency control-path testing.

## 12. Issues / Risks / Optimization Potential

### Verified risks

- The actual Mac inventory is missing.
- Backup and restore posture are unverified.
- Security posture is unverified at the macOS level.
- Browser and communication setup are unverified.
- There is likely local clutter from generated assets, node modules, and cache directories if this repo is kept on the Mac.

### Recommended optimization

- Create a real macOS export and attach it to this file.
- Separate workstation login recovery from bot operator credentials.
- Verify FileVault, firewall, and account recovery.
- Decide which folders are backed up and which are excluded.
- Keep archived docs as history, not as active run instructions.

## 13. Missing Information Checklist

To complete this inventory on the actual MacBook, verify:

- `About This Mac`
- `System Settings > General > About`
- `System Settings > Battery`
- `System Settings > Apple ID`
- `System Settings > Privacy & Security`
- `System Settings > General > Login Items`
- `System Settings > Network`
- `System Settings > Bluetooth`
- `System Settings > Accessibility`
- `Time Machine`
- Default browser and profiles
- Browser extensions
- Mail / Calendar / Contacts accounts
- Installed apps and license ownership
- Cloud storage clients and sync rules
- Recovery keys and emergency contact paths

## 14. Current Repo References

- [`README.md`](README.md)
- [`bot/README.md`](bot/README.md)
- [`bot/package.json`](bot/package.json)
- [`docs/bobbyexecution/production_readiness_checklist.md`](docs/bobbyexecution/production_readiness_checklist.md)
- [`docs/bobbyexecution/live_test_runbook.md`](docs/bobbyexecution/live_test_runbook.md)
- [`docs/bobbyexecution/incident_and_killswitch_runbook.md`](docs/bobbyexecution/incident_and_killswitch_runbook.md)
- [`RENDER_DEPLOYMENT.md`](RENDER_DEPLOYMENT.md)
- [`.env.example`](.env.example)
- [`.cursor/setup.sh`](.cursor/setup.sh)
- [`archive/README.md`](archive/README.md)

