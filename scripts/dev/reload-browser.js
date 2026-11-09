const revision = new URL(document.currentScript.src).searchParams.get("revision");

async function connect() {
  try {
    const workers = navigator.serviceWorker;
    const registration = await workers?.getRegistration(location.href);
    const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
    if (registration?.scope === new URL("/", location.href).href && worker?.scriptURL === new URL("/sw.js", location.href).href) {
      const wasControlled = Boolean(workers.controller);
      if (await registration.unregister() && wasControlled) {
        location.reload();
        return;
      }
    }
  } catch (error) {
    console.warn("[dev:firebase] Could not retire the local service worker:", error);
  }
  const events = new EventSource("/__axis_dev/events");
  events.onmessage = ({ data }) => {
    if (data === revision) return;
    events.close();
    location.reload();
  };
}
void connect();
