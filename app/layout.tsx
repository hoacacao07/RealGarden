import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import { AlertBanner } from "@/components/alerts/alert-banner";
import { ChatLauncher } from "@/components/assistant/chat-launcher";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "RealGarden", template: "%s · RealGarden" },
  description: "Design a beautiful Florida garden, know what to buy, and get simple care reminders and weather alerts.",
};

export const viewport: Viewport = { themeColor: "#2f6b4f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <AlertBanner />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
        <InspectorPanel />
        <ChatLauncher />
      </body>
    </html>
  );
}
