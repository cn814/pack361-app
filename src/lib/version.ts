// The app's version, shared with the guide (docs/guide): bump both together when people would
// notice the change. See docs/RELEASES.md.
export const APP_VERSION = "2.4";

/** "live" on app.pack361.org; "beta" on beta.pack361.org (NEXT_PUBLIC_APP_CHANNEL=beta in Vercel Preview). */
export const APP_CHANNEL: "live" | "beta" = process.env.NEXT_PUBLIC_APP_CHANNEL === "beta" ? "beta" : "live";
export const isBeta = () => APP_CHANNEL === "beta";
export const LIVE_URL = "https://app.pack361.org";
