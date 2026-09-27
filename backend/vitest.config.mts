import { defineConfig } from "vitest/config";

// Two suites, run separately:
//   npm test          test/unit, no services needed, runs in CI
//   npm run test:e2e  test/e2e, builds first and needs local Redis (see that folder)
export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
