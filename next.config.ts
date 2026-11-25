import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();
if (basePath && (!basePath.startsWith("/") || basePath === "/")) throw new Error("NEXT_PUBLIC_BASE_PATH 必须是以 / 开头的子路径");

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: basePath || undefined,
  // The static host serves directory indexes. Next dev needs the explicit file.
  ...(process.env.NODE_ENV === "development" && {
    rewrites: async () => [{ source: "/cuotiben/", destination: "/cuotiben/index.html" }],
  }),
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
