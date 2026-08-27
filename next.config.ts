import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
if (basePath && (!basePath.startsWith("/") || basePath === "/")) throw new Error("NEXT_PUBLIC_BASE_PATH 必须是以 / 开头的子路径");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  poweredByHeader: false,
  reactStrictMode: true,
};

export default nextConfig;
