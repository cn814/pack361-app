// Dark mode. The choice lives on each device (localStorage) and is applied by a tiny script in
// the page head before anything draws, so there's no white flash. globals.css holds the colours.

export type Theme = "light" | "dark" | "auto";
export const THEME_KEY = "pack-theme";
/** The phone's status bar colour (matches the green header) in light and dark mode. */
export const BAR_LIGHT = "#1b4332";
export const BAR_DARK = "#24583f";

/** Runs in <head> before the page paints. Keep it small and dependency-free. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="dark"&&t!=="auto")t="light";document.documentElement.dataset.theme=t;var d=t==="dark"||(t==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);if(!d)return;var f=function(){var m=document.querySelector('meta[name="theme-color"]');if(m)m.content="${BAR_DARK}"};f();document.addEventListener("DOMContentLoaded",f)}catch(e){}})()`;
