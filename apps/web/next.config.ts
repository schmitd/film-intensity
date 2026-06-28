import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@film-intensity/shared", "@film-intensity/db"],
};

export default nextConfig;
