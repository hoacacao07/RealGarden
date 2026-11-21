import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";

import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "NativeScape FL", template: "%s · NativeScape FL" },
  description: "Plan a low-maintenance Florida native garden, preview it through the year, and get early warnings.",
};

export const viewport: Viewport = { themeColor: "#2f6b4f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${figtree.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main id="main" className="flex-1">{children}</main>
        <SiteFooter />
        <InspectorPanel />
      </body>
    </html>
  );
}
