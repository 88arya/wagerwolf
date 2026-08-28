import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
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
