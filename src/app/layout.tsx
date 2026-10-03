import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BAR_LIGHT, THEME_SCRIPT } from "@/lib/theme";
import { SPLASH_SCRIPT } from "@/lib/splash";
import Splash from "@/components/Splash";

export const metadata: Metadata = {
  title: { default: "Pack 361", template: "%s · Pack 361" },
  description: "Private member app for Cub Scout Pack 361, Ellicott City MD",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Pack 361", statusBarStyle: "default" },
  robots: { index: false, follow: false }, // private site: keep out of search engines
};

export const viewport: Viewport = {
  themeColor: BAR_LIGHT,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets data-theme before React loads, so React leaves it alone.
    <html lang="en" className="h-full antialiased" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-full">
        <Splash />
        {children}
      </body>
    </html>
  );
}
