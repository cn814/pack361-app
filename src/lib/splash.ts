// The opening animation (public/splash.mp4) plays once, right after someone signs in. Signing in
// (the 6-digit code, or the email link) sets a short-lived cookie; a tiny script in <head>
// sees it before anything draws and shows the animation, which then clears the cookie. Never
// on the public pages, and never for people whose phone asks for reduced motion.

export const SPLASH_COOKIE = "pack_welcome";
/** Cookie options for the sign-in marker: readable by the page script, gone after 2 minutes. */
export const SPLASH_COOKIE_OPTIONS = { path: "/", maxAge: 120, sameSite: "lax" as const, secure: true, httpOnly: false };

export const SPLASH_SCRIPT = `(function(){try{if(!/(?:^|; )${SPLASH_COOKIE}=1/.test(document.cookie))return;if(/^\\/(login|join|get|safety|auth|api)(\\/|$)/.test(location.pathname))return;if(matchMedia("(prefers-reduced-motion: reduce)").matches){document.cookie="${SPLASH_COOKIE}=; Max-Age=0; path=/";return}document.documentElement.setAttribute("data-splash","show")}catch(e){}})()`;
