import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Never ship .map files to the public internet in production — they
  // expose your original TypeScript/JSX source (component logic, API
  // shapes, comments) to anyone who opens devtools. Next.js already
  // defaults this to false, but it's set explicitly here so it can never
  // be silently flipped on by a future config change.
  productionBrowserSourceMaps: false,

  // Removes the "X-Powered-By: Next.js" response header. Framework
  // fingerprinting isn't a real vulnerability by itself, but there's no
  // reason to advertise it either.
  poweredByHeader: false,

  compress: true,
};

export default nextConfig;
