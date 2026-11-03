// The browser SDK is ~34KB gzipped and was in the shared first-load chunk on
// every route. It is now a separate chunk fetched once the page is idle, and
// errors thrown before it arrives are held and sent once it has.

type Sdk = typeof import("./sentrySdk");

// Trimmed: a value pasted into a repository variable often carries a newline.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN?.trim() || undefined;

let sdk: Promise<Sdk> | null = null;
const early: unknown[] = [];
// A page throwing in a loop before the SDK arrives must not grow this forever.
const EARLY_MAX = 20;
const hold = (err: unknown) => { if (early.length < EARLY_MAX) early.push(err); };

function onError(e: ErrorEvent) { hold(e.error ?? e.message); }
function onRejection(e: PromiseRejectionEvent) { hold(e.reason); }

export function loadSentry(): Promise<Sdk> | null {
  if (!dsn) return null;
  if (sdk) return sdk;
  sdk = import("./sentrySdk").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      release: process.env.NEXT_PUBLIC_GIT_COMMIT_SHA || undefined,
    });
    if (typeof window !== "undefined") {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    }
    for (const err of early.splice(0)) Sentry.captureException(err);
    return Sentry;
  });
  // A chunk that fails to load (a tab left open across a deploy) must not be
  // cached as a rejection, which would surface as an unhandled rejection on
  // every later report. Forget it so the next call retries.
  sdk.catch(() => { sdk = null; });
  return sdk;
}

/** Start buffering errors now and load the SDK once the page has settled. */
export function startSentry(): void {
  if (!dsn) return;
  if (typeof window === "undefined") {
    loadSentry()?.catch(() => {});
    return;
  }
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);

  const idle = () => {
    const load = () => { loadSentry()?.catch(() => {}); };
    if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 4000 });
    else setTimeout(load, 1000);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

export function captureException(err: unknown): void {
  loadSentry()?.then((Sentry) => Sentry.captureException(err)).catch(() => {});
}
