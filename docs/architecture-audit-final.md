[Русский](architecture-audit-final.ru.md)

# Final architecture audit: Axis

2 November 2026. Reviewed baseline: `c31c1e7`, main after the Axis rename. Scope is the original eight cards in the [roadmap](architecture-audit-roadmap.md), not a new product specification. Evidence includes current execution paths, correction history, existing regressions and fresh local checks. No production data, deployment or actual Firebase bills were used.

## Verdict

**The original architecture audit is complete as an investigation, correction and documented limitation-acceptance cycle.** All three P1 corrections remain closed within their original scope. No new confirmed critical defect was identified in the reviewed scope; no runtime-code change is required by this audit. This does not guarantee an absence of all bugs or readiness for unspecified loads.

Implementation remains **4 corrected / 4 partially corrected**. Cards 4, 5, 7 and 8 are not relabelled as fully implemented. Their remaining work is conditional, not mandatory refactoring to finish the initial audit.

## All eight stages

| Stage | Implementation and evidence | Decision |
| --- | --- | --- |
| 1, P1, identity | Control-plan service joins source/registry/journal identities within a module, checks negative statuses first, and links closure to the original and a separate successful repeat inspection. Smoke/browser cases cover duplicates, conflicting links, foreign modules, newer negatives and legacy. Unverified historical engineering results do not prove current acceptance. | Original defect corrected; retain regressions. |
| 2, P1, writes | Repository commits source + registry + durable inspectionSync atomically; projection recovery compares revisions. Proven new canonical identities can update existing analytics in the same transaction. Emulator covers rejection, lost acknowledgement, retries, concurrency, access and reopening recovery. | Corrected; bulk atomicity is per batch, not project-wide. |
| 3, P1, races | Plan/summary check request generation, project and workspace before applying results; analytics receives a freshness guard. Browser tests cover A→B, repeated same-project requests, late errors, busy state and deselection. Overview rejects superseded generations too. | Corrected; cancelling every network request is not required for this guarantee. |
| 4, P2, reads | Overview reuses successful issues reads; summary passes its sources. In-flight repairs coalesce and proven new identities avoid repeated full scans. Budget/emulator regressions preserve revisions, alias lookup, transforms, legacy and fallback. | Confirmed bottlenecks corrected; update/delete cost remains below. |
| 5, P2, BIM | Measured sorting/repeated-search optimizations use weak ownership and mutable search-field signatures. IFC worker, units/placements, IndexedDB and viewer disposal are tested; publication retains immutable generations, epoch/revision, leases and GC fencing. Concurrent startup reads coalesce by UID/project. | Full-catalog memory risk remains documented; no current production OOM proven. |
| 6, P2, server | Runner bounds/expires history; HTTP disconnect cancels queue/parsing while started persistence finishes under its lock. Workers bound queue, bytes and time. Shutdown rejects new work and drains registered work. Real worker/socket and controlled failure cases exist. | Corrected for one process; distributed queue is not an existing requirement. |
| 7, P3, workspace | Runtime owns idempotent navigation init; 22 pure forwarding functions removed. Browser tests cover repeat init, lazy/coalescing, action-error fallback and journal→source in two documents. | Confirmed defect corrected; one workspace per Document remains explicit. |
| 8, P2, gates | Mandatory strict profile covers construction/registry and all four evaluators with dependent contracts; negative ESLint CLI fixtures exercise boundaries. Legacy reinforcement API re-exports the single evaluator. Units, incomplete inputs, subtypes and tolerances have regressions. | Selected engineering scope protected; global strict intentionally deferred. |

## Remaining items: defect, risk and current impact

| Remaining item | Classification and impact | Action now / continuation trigger |
| --- | --- | --- |
| 4: full rebuild for updates/deletes and ambiguous legacy | Confirmed algorithmic cost affecting existing operations; unacceptable production cost/latency is unproven. It is the safe fallback. | Document; measure representative updates/deletes against a target budget before expanding append optimization. |
| 4: multiple screen collections without a common transactional snapshot | Actual read-consistency limitation during concurrent writes; no proven loss of saved evidence or critical regression. Stale-UI guards do not create a shared snapshot. | Document; stronger consistency requires a concrete workflow, not automatic caching. |
| 2/4: pending recovery needs another client access; bulk clear spans batches | Actual recovery semantics: projections may lag and clearing may remain partial until retry. Each committed batch preserves source/registry agreement. | Existing retry/reopen suffices for reviewed scope; autonomous recovery SLA was not originally required. |
| 5: complete metadata catalog, cold search, structured clone | Structure/cost confirmed synthetically, target-device OOM/limit unproven. Large existing IFC workflows may be affected; actual production scale/devices unknown. | Document; before raising scale, establish representative anonymized geometry fixtures and peak worker/WASM/GPU/mobile budgets. |
| 6: process-local lock/rate/queue; no overall deadline after persistence starts | Actual single-process boundary. Instances do not share admission; hard kill cannot guarantee drain. Actual multi-process production topology was not verified. | Document; broker only for confirmed coordination/restart-survival needs. Publication/recovery protect persistence. |
| 7: module-level configure, multiple contexts in one Document | Confirmed unsupported combination, not a defect in the supported single-workspace/Document path. Two documents are tested. | No rewrite without actual remount need and DOM/disposal contract. New bundled test does not inject transport-level import failure; reset paths retained by inspection. |
| 8: legacy strict:false elsewhere; scoped import gates | Confirmed technical debt reducing guarantees in existing UI/services/server; it does not itself prove a calculation error or leak. | Expand with touched modules after compiler-closure assessment. Do not weaken types or enable global strict merely to close a card. |
| Windows generated-declaration check | Confirmed portability issue: document-validation.d.ts receives CRLF while shared:check compares LF bytes. Initial local build stopped; shared:generate changed line endings only, with an empty content Git diff. No runtime/data impact. | Noncritical; use the existing generator on Windows. An eol attribute correction can be separate work. |

## Data safety and evidence limits

Owner-scoped Firestore rules and emulator denial tests cover users/projects; server Admin adapters require existing HTTP authorization. This is not an audit of deployed Firebase configuration. SDK retries/channel cancellation use synthetic transport, not the user's extension-enabled Chrome. Source records, criteria versions, historical links and BIM snapshots were not migrated. Historical completeness does not substitute for current engineering acceptance.

Test sufficiency is scenario-based: public services/DOM, controlled partial failures and real emulator rules complement each other. Production SLA, full mobile memory budget, distributed drain and independent contexts in one DOM remain unproven. No duplicate tests of unchanged implementation were added.

## Performance and final checks

Historical comparisons remain historical: [analytics](inspection-analytics.md), 100 additions: 100→1 full queries, 5,050→1 returned documents (1,000 existing: 105,050→1,001), point reads 300→598, alias queries unchanged at 300. [BIM](bim-catalog-performance.md), 100k: Node sort 602→196 ms, Chrome warm search approximately 115→11–24 ms, catalog heap approximately 24→55 MiB. These are local synthetic results, not Firestore billing or peak process memory.

Fresh benchmark on 2 November, this baseline (one local run, Node 22.23.4 / headless Chrome):

| Elements | Normalization/sort, ms | Cold / warm search, ms | Catalog heap / after release, MiB | IFC worker total / transfer, ms |
| ---: | ---: | --- | ---: | ---: |
| 10k | 17.3 | 16.9 / 1.5–2.3 | 5.66 / 0.50 | 331.8 / 13.9 |
| 50k | 60.7 | 73.8 / 5.0–12.5 | 28.24 / 1.77 | 1,009.7 / 66.2 |
| 100k | 124.7 | 135.5 / 10.6–11.4 | 55.17 / 2.06 | 2,057.4 / 150.0 |

Method: existing `node scripts/checks/measure-bim-catalog.mjs`, CDP GC, synthetic columns checking count and X=1000 mm. Heap excludes worker/WASM/GPU. Results are consistent with earlier cost scale; no new bottleneck was demonstrated.

Final checks: clean npm ci in all three packages; typecheck including mandatory engineering strict, lint, build (after shared:generate as noted), npm test: **204 smoke + 58 core + 52 UI**, none failed/skipped; audit:all: zero vulnerabilities in all packages. Build includes api:check/shared:check. Firestore + Storage emulator: all four integration files including project-list, **37 passed**, none failed/skipped. Java 25 emitted a tooling NPE during emulator shutdown after successful script exit 0; a local tooling limitation, not failed tests or evidence of an application defect. CI uses Java 21.

Independent parallel Standards/Spec code-review against c31c1e7 and the current request: **0 / 0 findings**. Review confirmed evidence boundaries, source references, numerical results and translation parity. Synthetic fixtures and loopback emulators only; local logs and generated drift are excluded from the commit.
