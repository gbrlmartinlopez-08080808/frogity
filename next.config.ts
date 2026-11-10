import type { NextConfig } from "next";
import packageJson from "./package.json";

const nextConfig: NextConfig = {
  // Fully static site: it is bundled inside the Android app and can be hosted anywhere.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_APP_VERSION: packageJson.version },
};

export default nextConfig;
