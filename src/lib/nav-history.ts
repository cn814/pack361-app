// Where the person has been in the app, in this browser tab, so Back can go back one page.
// Kept in sessionStorage (this tab only, gone when it closes). Without it, Back goes to the page's
// usual parent instead.

const KEY = "pack-nav";

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list.slice(-50)));
  } catch {
    // Private mode or storage off: Back goes to the parent page.
  }
}

/** A page opened. Going back to the page before counts as going back, not a new visit. */
export function recordVisit(url: string) {
  const list = read();
  if (list.at(-1) === url) return;
  if (list.at(-2) === url) list.pop();
  else list.push(url);
  write(list);
}

/** Whether there's an app page to go back to in this tab. */
export function canGoBack(): boolean {
  return read().length >= 2;
}
