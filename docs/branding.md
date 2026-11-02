[Русский](branding.ru.md) | [English](branding.md)

# Axis branding and compatibility

Axis is the product name in both English and Russian. Use `Axis` in UI, PWA metadata, documentation, API titles and newly generated reports. The repository is https://github.com/valiibragimov/axis.

The rename requires no data migration. Existing accounts, projects, inspections and document versions retain their identifiers and evidence. Previously stored text and PDFs remain unchanged; new reports carry Axis branding and PDF metadata.

The following legacy technical names are intentionally retained:

- Firebase project IDs, auth domains, buckets, environment variables and emulator IDs: keep existing configuration and deployment targets.
- `tehnadzor-demo:v2:`, `tehnadzor_repeat_control` and IndexedDB `tehnadzor-bim-viewer`: preserve existing browser data.
- The `tehnadzor-` service worker cache prefix: preserve cache lifecycle behavior; the build still refreshes the content hash.
- `BIM_TO_TEHNADZOR_TYPE`, `getTehnadzorTypeByBimType`, demo adapter names and IFC exporter identifiers: preserve technical contracts and fixtures.
- Old-name strings in compatibility tests and production-config exclusion lists: continue detecting legacy settings and exercising stored data.

The Russian engineering term «технадзор» describes a supervision role or activity and is not a product name. Keep it in educational content and document requisites.

GitHub repository identity, history, issues, permissions and workflows remain attached to the renamed repository. Firebase hosting addresses are independent of the GitHub name and must not be renamed as part of branding.
