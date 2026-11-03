const scriptPromises = new Map();

const LIBS = {
  chartjs: {
    src: new URL("../../vendor/chart.js", import.meta.url).href,
    isLoaded: () => typeof window !== "undefined" && typeof window.Chart !== "undefined"
  },
  jspdf: {
    src: new URL("../../vendor/jspdf.js", import.meta.url).href,
    isLoaded: () =>
      typeof window !== "undefined" &&
      typeof window.jspdf !== "undefined" &&
      typeof window.jspdf.jsPDF !== "undefined"
  }
};

function loadScriptOnce(key) {
  const lib = LIBS[key];
  if (!lib) return Promise.resolve(false);
  if (lib.isLoaded()) return Promise.resolve(true);

  const cachedPromise = scriptPromises.get(key);
  if (cachedPromise) return cachedPromise;

  const promise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = lib.src;
    script.async = true;
    script.dataset.lazyLib = key;
    script.onload = () => {
      resolve(lib.isLoaded());
    };
    script.onerror = () => {
      resolve(false);
    };
    document.head.appendChild(script);
  }).finally(() => {
    if (!lib.isLoaded()) {
      scriptPromises.delete(key);
    }
  });

  scriptPromises.set(key, promise);
  return promise;
}

export async function ensureChartJsLoaded() {
  return loadScriptOnce("chartjs");
}

export async function ensureJsPdfLoaded() {
  return loadScriptOnce("jspdf");
}
