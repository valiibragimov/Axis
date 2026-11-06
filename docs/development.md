[Русский](development.ru.md) | [English](development.md)

# Development

All npm commands below run from the repository root unless stated otherwise. Use Node 22.12+ in the Node 22 release line (`.nvmrc`), and install each package from its lockfile:

```sh
npm ci
npm ci --prefix server
npm ci --prefix functions
```

## Main application with local emulators

Install Java 21+, run `npm run dev:local` and open <http://127.0.0.1:5050/login.html>. Register a local account and create a project. This uses the regular application build, real Firebase SDK, Firestore rules and Express API, with no replacement adapters.

Emulators bind to loopback: Firestore `28085`, Authentication `29099`, Storage `29199`. Ports come from `firebase.emulator.json`. Firebase’s reserved `demo-` project prefix denotes isolated tests, not a separate interface. Local startup does not import saved exports or change `.env`. Emulator data is temporary.

## Firebase application

Copy [.env.example](../.env.example) to `.env` and supply all six web configuration values from a dedicated development Firebase project. They are embedded in the client at build time. Keep Admin credentials out of this file.

Enable the sign-in providers used by your test accounts and authorise the local hostname in Firebase Authentication. Create Firestore and configure the repository's [rules](../firestore.rules) and [indexes](../firestore.indexes.json) in that development project. Do not use permissive rules as a setup shortcut.

```sh
npm run build
python -m http.server 8000 --bind 127.0.0.1 --directory dist-hosting
```

Open <http://127.0.0.1:8000/> and sign in with a development account. This mode persists data to the configured Firebase project. Use synthetic projects and models.

There is no hot reload command. After changes, rerun `npm run dev:local` for the emulator application, or `npm run build` for the configured static application. This refreshes `dist-hosting` as well as the compiled modules. `build/pages/index.html` is assembled from [HTML partials](../src/client/index-partials); edit those instead of the generated page.

## Optional Express API

The workspace can parse IFC and prepare report text in the browser. Run the API when developing the server paths.

Copy [server/.env.example](../server/.env.example) to `server/.env`. Configure Firebase Admin access for the same development project using either the documented service-account settings or Application Default Credentials. Keep `AUTH_REQUIRED=true`; the API verifies Firebase ID tokens and project access.

```sh
npm run dev --prefix server
```

This compiles the server, watches TypeScript, and restarts Node on changes. The default port is 5050. To run a compiled build without watch mode:

```sh
npm run build:server:ts
npm start --prefix server
```

The report API address is runtime configuration, not injected from root `.env`. The page must define `window.__APP_CONFIG__` with `AI_REPORT_API_BASE` before loading the application modules. Set it to the local API origin to use server reports, or leave it empty for browser report text. Include the static client's exact origin in the server's `ALLOWED_ORIGINS`.

The workspace currently imports IFC through its browser Worker and publishes directly through its Firestore adapter. The server IFC endpoint is a separate API path; the existing `BIM_IMPORT_API_BASE` configuration field does not switch the workspace to it.

Worker limits and request limits are documented in `server/.env.example`. The additional `IFC_WORKER_MAX_BYTES` setting caps worker input bytes (default 25 MiB); keep it consistent with the HTTP body limit. V8 heap limits do not bound WASM memory.

The Firebase Function in [functions/src/index.ts](../functions/src/index.ts) serves the profile news feed. It is separate from the inspection API and is not started by the local emulator command.

Chart.js and jsPDF are lazy-loaded from local build assets, with licenses copied alongside them. No external script CDN is required.

## Build outputs

`npm run build` cleans generated runtime files, compiles the client, server and Functions, builds the profile feed, and assembles and checks `dist-hosting`. It does not deploy anything.

| Output | Purpose |
| --- | --- |
| `dist/` | Browser modules, workers and viewer assets |
| `build/pages/` | Generated HTML pages |
| `build/emulator-hosting/` | Static app wired to loopback emulators |
| `dist-hosting/` | Static hosting files |
| `server/dist/` | Compiled Express API and shared server code |
| `functions/dist/` | Compiled Firebase Function |

The service worker is compiled to `dist/sw.js`. Sources belong in `src/client/pages`, `src/client/index-partials`, `src/client/styles` and `src/client/assets`; compiler profiles belong in `config/typescript`. Public URLs stay unchanged.

## Inspection write recovery

Inspection source records and their `inspections` projections commit atomically. Existing registry IDs are retained; new IDs include the source collection. Journal sessions also reserve their check number in the same transaction. Retry a create with the same source/session ID; it represents the same operation.

The additive project field `inspectionSync` has version `1`, a revision token and a `pending` flag. Analytics refresh clears the flag only if that revision still matches. A failed refresh leaves the marker in Firestore; reopening inspection modules retries it. Summary never falls back to a pending aggregate. No backfill or source format migration is required: projects without the field remain readable. Rolling back leaves existing source and registry formats readable and the marker ignored; reopen with the updated client to finish pending analytics repairs. Keep pending markers when rolling back.

## Verification

Inspection saves locate existing registry aliases through indexed source/document ID queries instead of scanning the project. Bulk deletion indexes the selected module's aliases once. Concurrent pending analytics refreshes share work per project; a new save requests a final revision check, and failures retain the durable recovery marker. Summary cards, control plan and detailed analytics reuse successful collection reads from that request, tagged with the project ID. Failed reads retain the existing fallback path; no persistent read cache or data migration is introduced.

Run the commands listed in [README](../README.md#development-and-tests) before submitting application changes.

- `npm test` rebuilds the application, then runs smoke, core and browser tests.
- When synthetic checks use `FIREBASE_CONFIG_MODE=test` beside a complete local `.env`, `npm test` restores that local login configuration and refreshes the service worker cache after success or failure. CI without a local `.env` keeps its synthetic runtime. Refresh `login.html` after the checks finish.
- `npm run test:core` builds the server and runs application, worker and IFC tests.
- `npm run test:ui` builds the main application and starts browser tests with Authentication, Firestore and Storage emulators. Fixtures are isolated; Java 21+ is required.
- `npm run test:integration` builds the server and starts a loopback Firestore emulator using [firebase.emulator.json](../firebase.emulator.json). It requires Java 21+ and uses a `demo-` project, not live credentials.
- `npm run audit:all` checks all three dependency lockfiles.

On Linux, install Chromium and its system dependencies with `npx playwright install --with-deps chromium`. Windows tests launch installed Google Chrome.

[CI](../.github/workflows/ci.yml) supplies fake Firebase web values for builds. Tests use synthetic fixtures; they must not depend on live project data.
