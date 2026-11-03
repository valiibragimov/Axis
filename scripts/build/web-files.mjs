import { resolve } from "node:path";

export const pageNames = ["404", "about", "edit-profile", "index", "login", "privacy", "profile", "register"];
export const styleNames = ["style.css", "liquid-glass.css"];
export const assetNames = ["favicon.ico", "fonts", "icons", "login-bg.jpg", "login-bg.webp", "manifest.json"];

/** Source locations are independent of the stable public URLs written into HTML. */
export function webFile(root, publicPath) {
  if (publicPath === "sw.js") return resolve(root, "dist/sw.js");
  if (pageNames.some(name => publicPath === name + ".html")) return resolve(root, "build/pages", publicPath);
  if (styleNames.includes(publicPath)) return resolve(root, "src/client/styles", publicPath);
  if (assetNames.some(name => publicPath === name || publicPath.startsWith(name + "/"))) return resolve(root, "src/client/assets", publicPath);
  return resolve(root, publicPath);
}
