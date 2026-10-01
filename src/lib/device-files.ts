// "Saved on this phone": a family's own copies of medical forms, insurance cards and other
// papers, kept only in this browser's IndexedDB. Nothing here is ever sent to the server.
// Browser-only: import from client components and call from effects or event handlers.
import { daysBetween, easternDate } from "./tz";

const DB_NAME = "pack361-files";
const DB_VERSION = 1;
const STORE = "files";

export const MAX_FILE_BYTES = 15 * 1024 * 1024;

export type FileKind = "medical_ab" | "medical_c" | "insurance" | "other";

export const FILE_KINDS: FileKind[] = ["medical_ab", "medical_c", "insurance", "other"];

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  medical_ab: "Medical form, Parts A and B",
  medical_c: "Medical form, Part C (doctor's exam)",
  insurance: "Insurance card",
  other: "Something else",
};

export const isMedical = (k: FileKind) => k === "medical_ab" || k === "medical_c";

export interface DeviceFile {
  id: string;
  /** The signed-in adult's id: another account signing in on this device doesn't see these. */
  ownerUserKey: string;
  familyKey: string;
  /** Who it's for: one of the family's people (e.g. "Sky") or anything typed in. */
  person: string;
  kind: FileKind;
  title: string;
  /** YYYY-MM-DD, the date written on the form. */
  formDate?: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  updatedAt: number;
}

export type DeviceFileDetails = Pick<DeviceFile, "person" | "kind" | "title" | "formDate">;

/** A failure with a message that can be shown to parents as is. */
export class DeviceFilesError extends Error {
  readonly reason: "unavailable" | "quota" | "not-found" | "failed";
  constructor(message: string, reason: DeviceFilesError["reason"]) {
    super(message);
    this.name = "DeviceFilesError";
    this.reason = reason;
  }
}

const UNAVAILABLE =
  "This browser won't let the app save files right now. Private browsing and some settings turn this off. Try a regular (not private) window.";
const QUOTA = "There isn't enough room on this device to save that. Remove a file you don't need or free up space, then try again.";
const FAILED = "Something went wrong saving on this device. Try again.";

function isQuota(e: unknown) {
  const name = (e as { name?: string } | null)?.name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

function wrap(e: unknown): DeviceFilesError {
  if (e instanceof DeviceFilesError) return e;
  if (isQuota(e)) return new DeviceFilesError(QUOTA, "quota");
  return new DeviceFilesError(FAILED, "failed");
}

/** Some older browsers can't store a Blob directly; those records hold the raw bytes instead. */
type Stored = Omit<DeviceFile, "blob"> & { blob: Blob | ArrayBuffer };

function fromStored(r: Stored): DeviceFile {
  return r.blob instanceof Blob ? (r as DeviceFile) : { ...r, blob: new Blob([r.blob], { type: r.mimeType }) };
}

// ---------------------------------------------------------------------------
// Opening the database
// ---------------------------------------------------------------------------
let opening: Promise<IDBDatabase> | null = null;

export function deviceFilesSupported(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB != null;
}

function openDb(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    if (!deviceFilesSupported()) {
      reject(new DeviceFilesError(UNAVAILABLE, "unavailable"));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      reject(new DeviceFilesError(UNAVAILABLE, "unavailable"));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("ownerUserKey", "ownerUserKey", { unique: false });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading or the browser clearing site data: open again next time.
      db.onversionchange = () => {
        db.close();
        opening = null;
      };
      db.onclose = () => {
        opening = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(new DeviceFilesError(UNAVAILABLE, "unavailable"));
    req.onblocked = () => reject(new DeviceFilesError("Close the app's other open tabs, then try again.", "failed"));
  });
  opening.catch(() => {
    opening = null;
  });
  return opening;
}

function request<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Runs `work` in one transaction and resolves once the transaction has committed. */
async function tx<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    const t = db.transaction(STORE, mode);
    const done = new Promise<void>((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error ?? new DOMException("Aborted", "AbortError"));
    });
    done.catch(() => {});
    const result = await work(t.objectStore(STORE));
    await done;
    return result;
  } catch (e) {
    throw wrap(e);
  }
}

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------
function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** This account's files on this device, newest first. */
export async function listFiles(ownerUserKey: string): Promise<DeviceFile[]> {
  const rows = await tx("readonly", (s) => request(s.index("ownerUserKey").getAll(IDBKeyRange.only(ownerUserKey)) as IDBRequest<Stored[]>));
  return rows.map(fromStored).sort((a, b) => b.updatedAt - a.updatedAt);
}

/** How many files other accounts saved on this device (they stay hidden). */
export async function countOtherOwners(ownerUserKey: string): Promise<number> {
  const [all, mine] = await tx("readonly", (s) =>
    Promise.all([request(s.count()), request(s.index("ownerUserKey").count(IDBKeyRange.only(ownerUserKey)))]),
  );
  return Math.max(0, all - mine);
}

async function putRecord(rec: DeviceFile): Promise<void> {
  try {
    await tx("readwrite", (s) => request(s.put(rec)));
  } catch (e) {
    if (e instanceof DeviceFilesError && e.reason !== "failed") throw e;
    // Fall back to storing the raw bytes for browsers that can't store a Blob.
    const bytes = await rec.blob.arrayBuffer();
    await tx("readwrite", (s) => request(s.put({ ...rec, blob: bytes } satisfies Stored)));
  }
}

export async function addFile(
  owner: { ownerUserKey: string; familyKey: string },
  details: DeviceFileDetails,
  blob: Blob,
): Promise<DeviceFile> {
  checkSize(blob);
  const now = Date.now();
  const rec: DeviceFile = {
    id: newId(),
    ownerUserKey: owner.ownerUserKey,
    familyKey: owner.familyKey,
    ...cleanDetails(details),
    blob,
    mimeType: blob.type || "application/octet-stream",
    size: blob.size,
    createdAt: now,
    updatedAt: now,
  };
  await putRecord(rec);
  return rec;
}

async function getOwned(ownerUserKey: string, id: string): Promise<DeviceFile> {
  const row = await tx("readonly", (s) => request(s.get(id) as IDBRequest<Stored | undefined>));
  if (!row || row.ownerUserKey !== ownerUserKey) throw new DeviceFilesError("That file isn't on this device anymore.", "not-found");
  return fromStored(row);
}

export async function updateDetails(ownerUserKey: string, id: string, details: DeviceFileDetails): Promise<DeviceFile> {
  const cur = await getOwned(ownerUserKey, id);
  const rec: DeviceFile = { ...cur, ...cleanDetails(details), updatedAt: Date.now() };
  await putRecord(rec);
  return rec;
}

export async function replaceFile(ownerUserKey: string, id: string, blob: Blob): Promise<DeviceFile> {
  checkSize(blob);
  const cur = await getOwned(ownerUserKey, id);
  const rec: DeviceFile = { ...cur, blob, mimeType: blob.type || "application/octet-stream", size: blob.size, updatedAt: Date.now() };
  await putRecord(rec);
  return rec;
}

export async function deleteFile(ownerUserKey: string, id: string): Promise<void> {
  await getOwned(ownerUserKey, id);
  await tx("readwrite", (s) => request(s.delete(id)));
}

/** Removes every file this account saved on this device. Returns how many were removed. */
export async function deleteAllForOwner(ownerUserKey: string): Promise<number> {
  // A cursor (rather than awaiting between steps) keeps the transaction open in older Safari.
  return tx(
    "readwrite",
    (s) =>
      new Promise<number>((resolve, reject) => {
        let n = 0;
        const r = s.index("ownerUserKey").openCursor(IDBKeyRange.only(ownerUserKey));
        r.onsuccess = () => {
          const c = r.result;
          if (!c) return resolve(n);
          c.delete();
          n++;
          c.continue();
        };
        r.onerror = () => reject(r.error);
      }),
  );
}

function checkSize(blob: Blob) {
  if (blob.size > MAX_FILE_BYTES) throw new DeviceFilesError(`That file is ${fmtBytes(blob.size)}. Files can be up to 15 MB.`, "failed");
}

function cleanDetails(d: DeviceFileDetails): DeviceFileDetails {
  const formDate = d.formDate && /^\d{4}-\d{2}-\d{2}$/.test(d.formDate) ? d.formDate : undefined;
  return {
    person: d.person.trim().slice(0, 80) || "Family",
    kind: FILE_KINDS.includes(d.kind) ? d.kind : "other",
    title: d.title.trim().slice(0, 120) || FILE_KIND_LABEL[d.kind] || "Saved file",
    formDate,
  };
}

// ---------------------------------------------------------------------------
// Storage on this device
// ---------------------------------------------------------------------------
export interface StorageInfo {
  /** Bytes this site is using on the device (all of its storage, not just these files). */
  usage: number | null;
  quota: number | null;
  /** True: the browser promised not to clear it on its own. Null: the browser can't say. */
  persisted: boolean | null;
}

export async function storageInfo(): Promise<StorageInfo> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  const [est, persisted] = await Promise.all([
    sm?.estimate ? sm.estimate().catch(() => null) : null,
    sm?.persisted ? sm.persisted().catch(() => null) : null,
  ]);
  return { usage: est?.usage ?? null, quota: est?.quota ?? null, persisted };
}

/** Asks the browser to keep this site's storage (no prompt in most browsers). */
export async function requestPersist(): Promise<boolean | null> {
  const sm = typeof navigator !== "undefined" ? navigator.storage : undefined;
  if (!sm?.persist) return null;
  try {
    if (sm.persisted && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return null;
  }
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// ---------------------------------------------------------------------------
// Medical form dates (same rules as formState in lib/paperwork.ts, which is server-only)
// ---------------------------------------------------------------------------
export type ExpiryState = "current" | "expiring" | "expired";

/** Form date + 1 year - 1 day, matching the database (Feb 29 -> Feb 27 the next year). */
export function formExpiresOn(formDate: string): string {
  const y = +formDate.slice(0, 4) + 1;
  const m = +formDate.slice(5, 7);
  let d = +formDate.slice(8, 10);
  if (m === 2 && d === 29) d = 28;
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

export function expiryState(expiresOn: string, today = easternDate(Date.now())): ExpiryState {
  if (expiresOn < today) return "expired";
  if (daysBetween(today, expiresOn) <= 45) return "expiring";
  return "current";
}

/** Same person? Matches "Sky" with "Sky" or "Sky (Wolf)", ignoring case. */
export function samePerson(saved: string, name: string): boolean {
  const a = saved.trim().toLowerCase();
  const b = name.trim().toLowerCase();
  return a === b || a.startsWith(`${b} (`);
}
