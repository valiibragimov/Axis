[Русский](branding.ru.md) | [English](branding.md)

# Axis branding and compatibility

Axis is the product name in both English and Russian. Use `Axis` in UI, PWA metadata, documentation, API titles and newly generated reports. The repository is https://github.com/valiibragimov/axis.

The rename requires no data migration. Existing accounts, projects, inspections and document versions retain their identifiers and evidence. Previously stored text and PDFs remain unchanged; new reports carry Axis branding and PDF metadata.

The following legacy technical names are intentionally retained:

- `tehnadzor_repeat_control` and IndexedDB `tehnadzor-bim-viewer`: preserve existing browser data.
- The `tehnadzor-` service worker cache prefix: preserve cache lifecycle behavior; the build still refreshes the content hash.
- Old-name strings in compatibility tests and production-config exclusion lists: continue detecting legacy settings and exercising stored data.

The Russian engineering term «технадзор» describes a supervision role or activity and is not a product name. Keep it in educational content and document requisites.

GitHub repository identity, history, issues, permissions and workflows remain attached to the renamed repository. Firebase hosting addresses are independent of the GitHub name and must not be renamed as part of branding.

## Firebase Hosting

[Axis](https://axisxyz.web.app) uses Hosting site `axisxyz` in the existing Firebase project `tehnadzor-online`. Keep the project ID, web app ID and Storage bucket from that project. For the production build, set `FIREBASE_WEB_AUTH_DOMAIN=axisxyz.web.app`. Firebase Authentication must allow this domain, and the existing Google OAuth client must allow the origin `https://axisxyz.web.app` and redirect URI `https://axisxyz.web.app/__/auth/handler`.

Build with `npm run build` and deploy Hosting only with `firebase deploy --only hosting:axisxyz --project tehnadzor-online`. Firebase retains the default site and its provisioned domains. Browser sign-in and local cache are origin-specific, so open the new site and sign in with your existing account.
