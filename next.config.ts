import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BlockNote does not support React StrictMode.
  reactStrictMode: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
