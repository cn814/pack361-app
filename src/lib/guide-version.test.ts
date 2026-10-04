// Run with: npm test. The app guide's cover version must match the app's version, so a release
// that changes features doesn't ship an old guide at /app-guide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { APP_VERSION } from "./version";

test("the guide's version matches the app's", () => {
  const html = readFileSync(new URL("../../docs/guide/guide.html", import.meta.url), "utf8");
  const m = html.match(/<span>Version ([0-9.]+) ·/);
  assert.ok(m, "cover version not found");
  assert.equal(m[1], APP_VERSION);
});
