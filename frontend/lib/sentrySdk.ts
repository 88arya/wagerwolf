// Named imports so the bundler can tree-shake; lib/sentryClient imports this
// module dynamically. Importing "@sentry/browser" itself dynamically pulls in
// the whole namespace (replay, feedback, ...), ~4x the size.
export { init, captureException } from "@sentry/browser";
