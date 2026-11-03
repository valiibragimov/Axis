# Axis engineering rules

## Working agreement

Inspect the actual execution path before changing it. Implement small, coherent vertical changes with meaningful verification. Do not create parallel implementations, speculative frameworks, empty layers, or large audit documents. Prefer removing code to adding adapters without consumers.

User data and inspection correctness take precedence over visual changes. Never deploy, run a backfill against a live project, delete real data, or print credentials as part of development.

## Boundaries

- `src/shared/bim/publication.ts`: common atomic publication policy. Stage immutable generations before publishing the manifest; preserve revision/epoch checks. Use the fenced generation registry, cursor pages and renewable reader leases. GC must transactionally validate the coordination revision and relevant leases after scanning readers, fence staging writers before deleting chunks, and preserve active manifests. Never collect unregistered legacy generations without quiescing old writers and verifying receipts. Retain immutable engineering snapshots across concurrent catalog changes. Client declarations are generated with `npm run shared:generate`; CI/build rejects drift.
- `src/shared/bim/types.ts`: vendor-independent engineering data, in millimetres.
- `src/shared/bim/ifc-model.ts`: the sole IFC import adapter (WebIFC). STEP grammar belongs to the library, not regular expressions. Keep unknown measurements null. Never use rendered bounding boxes as authoritative design dimensions.
- `server/src/application`: application policy and injected ports. No Express, Firebase, browser APIs or concrete worker implementations.
- `server/src/repositories`, `server/src/infrastructure`: Firebase and persistence adapters.
- `server/src/workers`: CPU work only; no Firestore side effects. Bound concurrency, queue size, input size and execution time. Handle cancellation and shutdown.
- `src/client/features`: feature services and UI. UI calls services; repositories own persistence. Legacy violations are migration debt, not a pattern to copy.
- `src/client/infrastructure/api`: generated route identifiers and the typed HTTP transport.
- `src/client/shared/i18n`: presentation translations. English identifiers and status codes belong in domain contracts; normative symbols and existing stored values must not be translated in place.
- `server/src/presentation`: report text rendering, separate from HTTP and persistence.

Single Responsibility: split by a real reason to change, not by file length. Dependency Inversion: application services consume small typed ports; composition supplies implementations. Open/Closed: add a provider through an existing port when needed, not conditionals spread across UI and services. Shared code must not depend on client, server or Firebase runtime.

Use feature public APIs across feature boundaries. Do not add global state bridges. Pass workspace dependencies through `WorkspaceContext` at composition; features own their mutable state. Do not add infrastructure imports to calculation or evaluation modules. Preserve stable IDs and stored Firestore contracts; a data format change needs a versioned migration and a rollback path.

## New feature acceptance

Before implementation, identify the feature owner, existing public API and evaluator, persistence adapter, and failure/retry path. Reuse the authoritative calculation rather than copying it into UI, reports or analytics. Keep new inspection evaluators under `src/client/features/inspections/<feature>/evaluation.ts`; the engineering strict profile includes that convention automatically. For other new modules, assess their compiler closure and add a scoped strict entry before introducing untyped contracts.

At review, account for changed units/tolerances, incomplete inputs, stable identities, old stored records and concurrent project/user changes. Persistence changes need synthetic rejection/retry/recovery tests; schema changes need the migration/rollback contract described above. State the supported runtime/workspace scope. Use the existing CI typecheck, lint and test gates; their negative fixtures must reject forbidden dependencies as well as accept supported ports. Duplicate calculation prevention still requires review of consumers; import checks are not semantic clone detection.

## HTTP contract

Request validators are in `server/src/http-contract.ts`; `scripts/build/generate-api.mjs` composes the OpenAPI contract. Run `npm run api:generate` after changes. `api/openapi.json`, `src/shared/api-schema.d.ts` and route modules are generated: never edit them manually. `npm run api:check` rejects drift. Own HTTP calls use the generated types and route identifiers, with deadlines and auth. Do not log request bodies, reports or tokens.

## UI and dependencies

`src/client/styles/style.css` is legacy CSS contained in the `legacy` cascade layer. The shared design system lives in the `design` layer in `src/client/styles/liquid-glass.css`; public asset URLs remain flat. Extend semantic tokens and existing components; do not add another override stylesheet, decorative blur/glow, or pointer-motion effects. Verify keyboard access, light/dark themes, mobile width and reduced motion. Test the actual application with Firebase emulators and synthetic records.

Before adding a dependency, check its license, maintained releases, runtime support, bundle cost and whether an installed solution already does the job. Declare direct imports directly. Keep reproducible lockfiles and run all dependency audits. Never patch `node_modules` silently. Isolate vendors only at useful, exercised boundaries.

## Verification

Use Node 22 (`.nvmrc`). Install root, server and functions dependencies with `npm ci` in each package. Run:

```sh
npm run api:check
npm run shared:check
npm run typecheck
npm run lint
npm run build
npm test
npm run test:integration
npm run audit:all
```

The test command includes smoke, core application/worker tests, and real browser tests. On Linux, install the test browser with `npx playwright install --with-deps chromium`. Windows UI tests use installed Chrome. Use synthetic fixtures; never require live production credentials. Integration tests require Java 21+ and run only against the loopback Firestore emulator with a `demo-` project ID. IFC changes need browser WASM and Node worker parity checks, units, placements, metadata and failure-path tests. A successful build is not evidence of a working viewer. Exercise viewer close/reopen and resource disposal, bounded BIM selectors with a large synthetic catalog, and repeat control without overwriting original inspection evidence. Do not retain full parser stores after scene construction or translate values used by domain normalization.

Generated outputs (`build/pages`, `dist`, `dist-hosting`, `server/dist`, `functions/dist`) are rebuilt from source. Pages live in `src/client/pages` and `src/client/index-partials`, static assets in `src/client/assets`, compiler profiles in `config/typescript`. Do not edit outputs by hand. Keep local logs, screenshots and probes under ignored `output/` or `tmp/`. Do not commit node_modules, local env files, service accounts or browser profiles. Delete files only after tracing imports and build consumers.
