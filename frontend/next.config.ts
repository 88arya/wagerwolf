import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /**
   * SELF-HOSTED, so Next has to emit a server we can run in a container.
   *
   * `standalone` traces the modules the app actually reaches and writes a
   * self-contained `.next/standalone` with its own minimal node_modules, so the
   * runtime image does not carry the full dependency tree. See frontend/Dockerfile
   * — it also has to copy `.next/static` and `public` separately, because
   * tracing deliberately does not include them.
   *
   * Harmless in development: it changes what `next build` emits and nothing
   * about `next dev`.
   */
  output: "standalone",
  turbopack: {
    root: path.join(__dirname),
  },
  // Hides the dev-only route indicator that floats over the bottom-left corner.
  // It sat on top of the page ground and read as part of the design in
  // screenshots. Errors are unaffected: Next still surfaces every build and
  // runtime error overlay, this only removes the badge.
  devIndicators: false,
};

export default nextConfig;
