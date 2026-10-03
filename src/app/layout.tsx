import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { BAR_LIGHT, THEME_SCRIPT } from "@/lib/theme";
import { SPLASH_SCRIPT } from "@/lib/splash";
import Splash from "@/components/Splash";

// Self-hosted at build time, so phones never wait on fonts.googleapis.com before first paint.
// Variable font: covers the 400-800 weights the app uses. globals.css reads --font-jakarta.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jakarta",
});

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
    <html lang="en" className={`${jakarta.variable} h-full antialiased`} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <Splash />
        {children}
      </body>
    </html>
  );
}
