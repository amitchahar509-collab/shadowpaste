import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { FuturisticBackground } from "@/components/shadowpaste/futuristic-background";

// Suppress THREE.Clock deprecation warning (R3F internal, non-breaking)
if (typeof window !== "undefined") {
  const _origWarn = console.warn.bind(console);
  console.warn = (...args: unknown[]) => {
    if (args.length > 0 && typeof args[0] === "string" && args[0].includes("THREE.Clock")) return;
    _origWarn(...args);
  };
}

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ShadowPaste V18 — AI Agent Security OS",
  description: "The security layer between developers, AI agents, and real systems. Zero-trust MCP gateway, agent identities, permission control, flight recorder, sandbox, and AI safety scoring.",
  keywords: ["ShadowPaste", "AI Security", "MCP", "Zero Trust", "AI Agent", "Prompt Injection", "Claude", "ChatGPT", "Cursor"],
  icons: { icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased text-foreground`}>
        <FuturisticBackground />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
