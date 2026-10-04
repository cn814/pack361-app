// The opening animation (public/splash.mp4) plays once, right after someone signs in. Signing in
// (the 6-digit code, or the email link) sets a short-lived cookie, and leaders get a fresh one when
// they enter their authenticator code, so it plays once they're all the way in. A tiny script in
// <head> shows it on a full page load before anything draws; the Splash component also checks after
// in-app page changes. The animation then clears the cookie. Never on the public pages or the
// sign-in screens (the code box there brings up the keyboard), and never for people whose phone
// asks for reduced motion.

export const SPLASH_COOKIE = "pack_welcome";
/** Cookie options for the sign-in marker: readable by the page script, gone after 2 minutes. */
export const SPLASH_COOKIE_OPTIONS = { path: "/", maxAge: 120, sameSite: "lax" as const, secure: true, httpOnly: false };

/** Pages the animation never plays on (as a RegExp source, shared with the head script). */
export const SPLASH_SKIP_PATHS = "^\\/(login|join|get|safety|auth|api|two-step|not-on-roster|beta-only)(\\/|$)";

export const SPLASH_SCRIPT = `(function(){try{if(!/(?:^|; )${SPLASH_COOKIE}=1/.test(document.cookie))return;if(new RegExp(${JSON.stringify(SPLASH_SKIP_PATHS)}).test(location.pathname))return;if(matchMedia("(prefers-reduced-motion: reduce)").matches){document.cookie="${SPLASH_COOKIE}=; Max-Age=0; path=/";return}document.documentElement.setAttribute("data-splash","show")}catch(e){}})()`;
