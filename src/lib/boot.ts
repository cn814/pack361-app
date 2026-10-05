// The loading screen shown while the app opens (src/components/BootLoader.tsx). Opening the app
// takes a few seconds: the server checks who's signed in, then builds the page. Without this the
// phone shows a blank screen for that time.
//
// The root loading.tsx lets the server send the top of the page (and this screen) right away,
// instead of waiting until the whole page is built. Everything still loading is marked
// data-boot-wait: the root loading.tsx and the page skeleton (PageSkeleton). This tiny script in
// <head> watches the page as it arrives and lifts the loading screen once nothing is marked any
// more, or when the page has finished arriving, or after 15 seconds at most. It only runs on a
// full page load (opening the app, or a reload): moving between pages inside the app shows the
// usual page skeleton instead. A page that's ready in a blink never shows it (the screen fades in
// after a moment).
//
// Opening from the home screen when the server is slow to answer, the service worker shows a copy
// of this screen first and comes here with ?_b=1 (public/sw.js): the script takes that back off
// the address, and the screen shows at once (no fade-in), carrying straight on from the copy.

export const BOOT_SCRIPT = `(function(){var h=document.documentElement;try{if(/[?&]_b=1(&|$)/.test(location.search)){var u=new URL(location.href);u.searchParams.delete("_b");history.replaceState(history.state,"",u.pathname+u.search+u.hash);h.setAttribute("data-boot-instant","")}var d=document,seen=0,mo,t0=Date.now();function done(){if(h.hasAttribute("data-booted"))return;if(mo)mo.disconnect();if(Date.now()-t0<150){h.setAttribute("data-booted","");return}h.setAttribute("data-booted","leaving");setTimeout(function(){h.setAttribute("data-booted","")},400)}function check(){if(d.querySelector("[data-boot-wait]"))seen=1;else if(seen)done()}mo=new MutationObserver(check);mo.observe(h,{childList:true,subtree:true});d.addEventListener("DOMContentLoaded",done);setTimeout(done,15000)}catch(e){h.setAttribute("data-booted","")}})()`;
