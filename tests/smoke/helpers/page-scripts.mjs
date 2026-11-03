// Inspect the scripts served with a page, including scripts externalized for CSP.
export async function pageScripts(html, baseUrl) {
  const sources = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gu)].map(match => new URL(match[1], baseUrl));
  const scripts = await Promise.all(sources.filter(url => url.origin === new URL(baseUrl).origin).map(async url => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Script is missing: ${url.pathname}`);
    return response.text();
  }));
  return scripts.join('\n');
}
