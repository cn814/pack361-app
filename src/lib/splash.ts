// The opening animation (public/splash.mp4): shown once per visit when the app opens or right
// after signing in, while the first page loads. A tiny script in <head> decides before anything
// draws, so it never flashes the page first. Not on the public pages (sign-in, join, get the
// app, safety), and never for people whose phone asks for reduced motion.

export const SPLASH_KEY = "pack-splash-seen";

export const SPLASH_SCRIPT = `(function(){try{if(/^\\/(login|join|get|safety|auth|api)(\\/|$)/.test(location.pathname))return;if(sessionStorage.getItem("${SPLASH_KEY}"))return;if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;document.documentElement.setAttribute("data-splash","show")}catch(e){}})()`;
