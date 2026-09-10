import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui-theme.css";
import "./home-editorial.css";
import "./ui-language.css";

export const metadata: Metadata = {
  title: "专注作业 持续理解",
  description: "面向学生的 K12 引导式自主学习工具",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fdfdfd",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className="apple-ui">{children}</body></html>;
}
