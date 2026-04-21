import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/features/shared/components/app-shell";
import { PwaRegisterClient } from "@/features/shared/components/pwa-register-client";

export const metadata: Metadata = {
  title: "训练管理系统",
  description: "训练安排与训练记录系统",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "训练系统",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1120",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground transition-colors">
        <AppShell>{children}</AppShell>
        <PwaRegisterClient />
      </body>
    </html>
  );
}
