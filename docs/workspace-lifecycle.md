# Workspace lifecycle boundary

[Русский](workspace-lifecycle.ru.md)

Stage 7 investigation from `9427044`, 31 October 2026. Production `app.ts` creates one bridge/context per document. Navigation and legacy features use fixed document-wide IDs. ES module configuration in journal/summary/geometry is therefore currently document-scoped, not an independently mountable multi-workspace API.

## Confirmed change

Repeated calls to the same bridge's public `initNavigation()` fired two extra activation events and replaced bottom-navigation elements. The real-browser regression reproduced `{ activations: 2, sameItem: false }`; after the fix it observes `{ activations: 0, sameItem: true }`. Initialization state now belongs to the module runtime closure, alongside that workspace's lazy promises. DOM-ready initialization remains deferred. A synchronous setup failure clears the flag for retry. Reinitialization still asks the existing tab loader to retry a failed lazy load, without rebinding navigation or emitting another activation.

Twenty-two bridge functions only forwarded to an identically named runtime method. They now alias those functions directly; the bridge retains its inspection adapters and its original public action names/defaults/fallbacks. Runtime construction allocates only closures/maps; it imports no feature module and queries no DOM. Dynamic imports/configuration still happen in the existing loader methods, with their error/reset handling unchanged. No new registry, framework, global state bridge or per-workspace module-URL cache was introduced.

## Evidence and limits

The original experiments used a test runtime that has since been removed. Current `tests/ui/main-app.test.mjs` exercises the main application with the real Firebase SDK and emulators: navigation, saved inspection updates and reloads, project isolation, profile and the mobile drawer. The investigation above records the architectural boundary at its original date.
