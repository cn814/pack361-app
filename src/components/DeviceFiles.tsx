"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CircleCheck,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  FileText,
  HardDrive,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  DeviceFilesError,
  FILE_KIND_LABEL,
  FILE_KINDS,
  MAX_FILE_BYTES,
  addFile,
  countOtherOwners,
  deleteAllForOwner,
  deleteFile,
  deviceFilesSupported,
  expiryState,
  fmtBytes,
  formExpiresOn,
  isMedical,
  listFiles,
  replaceFile,
  requestPersist,
  samePerson,
  storageInfo,
  updateDetails,
  type DeviceFile,
  type DeviceFileDetails,
  type ExpiryState,
  type FileKind,
  type StorageInfo,
} from "@/lib/device-files";
import { fmtShortDate } from "@/lib/advancement";
import { easternDate } from "@/lib/tz";

export interface FamilyPerson {
  name: string;
  detail: string | null;
}

const OTHER = "__other";
const LONG_EDGE = 2000;

const EXPIRY_LABEL: Record<ExpiryState, string> = { current: "Current", expiring: "Expires soon", expired: "Expired" };
const EXPIRY_STYLE: Record<ExpiryState, string> = {
  current: "bg-mint text-pine",
  expiring: "bg-gold-50 text-gold-800",
  expired: "bg-danger-50 text-danger",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function message(e: unknown) {
  return e instanceof DeviceFilesError ? e.message : "Something went wrong. Try again.";
}

const TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  heic: "image/heic",
  heif: "image/heif",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

/** The file's type, or a guess from its name when the phone didn't say. */
function typeOf(f: File) {
  return f.type || TYPE_BY_EXT[/\.([a-z]+)$/i.exec(f.name)?.[1]?.toLowerCase() ?? ""] || "";
}

function okType(f: File) {
  const t = typeOf(f);
  return t === "application/pdf" || t.startsWith("image/");
}

/**
 * Big phone photos are redrawn at about 2000px on the long edge as JPEG. PDFs, small photos and
 * photos this browser can't read (e.g. HEIC outside Safari) are kept exactly as they are.
 */
async function prepare(file: File, shrink: boolean): Promise<Blob> {
  const type = typeOf(file);
  const original = type === file.type ? file : new Blob([file], { type });
  if (!shrink || !type.startsWith("image/") || /gif|svg/i.test(type)) return original;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    try {
      const scale = Math.min(1, LONG_EDGE / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && file.size < 1.5 * 1024 * 1024) return original;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return original;
      ctx.fillStyle = "#fff"; // transparent PNGs get a white page, not black
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      return out && out.size < file.size ? out : original;
    } finally {
      bitmap.close();
    }
  } catch {
    return original;
  }
}

function extension(mime: string) {
  if (mime === "application/pdf") return "pdf";
  if (mime === "image/jpeg") return "jpg";
  const m = /^image\/([a-z0-9+.-]+)$/i.exec(mime);
  return m ? m[1].replace("svg+xml", "svg") : "bin";
}

function fileName(f: DeviceFile) {
  const base = `${f.person} ${f.title}`.replace(/[^\w\- ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80) || "pack-file";
  return `${base}.${extension(f.mimeType)}`;
}

/** Can this browser hand a file to the phone's share sheet? Checked once, on the client. */
let shareable: boolean | null = null;
function detectShare(): boolean {
  if (shareable === null) {
    try {
      const probe = new File(["x"], "x.pdf", { type: "application/pdf" });
      shareable = typeof navigator.share === "function" && typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] });
    } catch {
      shareable = false;
    }
  }
  return shareable;
}
const noSubscribe = () => () => {};

/** Keep a copy of this page for use with no signal (see public/sw.js). Quiet; best effort. */
function saveForOffline() {
  try {
    const worker = navigator.serviceWorker?.controller;
    if (!worker || !navigator.onLine) return;
    const assets = performance
      .getEntriesByType("resource")
      .map((e) => e.name)
      .filter((u) => u.startsWith(location.origin) && /\/_next\/static\//.test(u));
    worker.postMessage({ type: "save", urls: [location.pathname, ...assets] });
  } catch {}
}

// ---------------------------------------------------------------------------
// The details fields, shared by "Add a file" and "Edit details"
// ---------------------------------------------------------------------------
interface Draft {
  personChoice: string;
  personOther: string;
  kind: FileKind;
  title: string;
  formDate: string;
}

function draftFrom(people: FamilyPerson[], f?: Pick<DeviceFile, "person" | "kind" | "title" | "formDate">, person?: string): Draft {
  const who = f?.person ?? person ?? people[0]?.name ?? "";
  const match = people.find((p) => samePerson(who, p.name));
  return {
    personChoice: match ? match.name : who ? OTHER : people[0]?.name ?? OTHER,
    personOther: match ? "" : who,
    kind: f?.kind ?? "medical_ab",
    title: f?.title ?? "",
    formDate: f?.formDate ?? "",
  };
}

function detailsFrom(d: Draft): DeviceFileDetails {
  return {
    person: d.personChoice === OTHER ? d.personOther : d.personChoice,
    kind: d.kind,
    title: d.title,
    formDate: d.formDate || undefined,
  };
}

function DetailsFields({
  idPrefix,
  draft,
  setDraft,
  people,
  today,
  disabled,
}: {
  idPrefix: string;
  draft: Draft;
  setDraft: (d: Draft) => void;
  people: FamilyPerson[];
  today: string;
  disabled: boolean;
}) {
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1" htmlFor={`${idPrefix}-person`}>
          <span className="text-xs font-bold text-navy">Who is it for?</span>
          <select
            id={`${idPrefix}-person`}
            className="input"
            value={draft.personChoice}
            onChange={(e) => set({ personChoice: e.target.value })}
            disabled={disabled}
          >
            {people.map((p) => (
              <option key={p.name} value={p.name}>
                {p.detail ? `${p.name} (${p.detail})` : p.name}
              </option>
            ))}
            <option value={OTHER}>Someone else…</option>
          </select>
        </label>
        <label className="block space-y-1" htmlFor={`${idPrefix}-kind`}>
          <span className="text-xs font-bold text-navy">What is it?</span>
          <select
            id={`${idPrefix}-kind`}
            className="input"
            value={draft.kind}
            onChange={(e) => set({ kind: e.target.value as FileKind })}
            disabled={disabled}
          >
            {FILE_KINDS.map((k) => (
              <option key={k} value={k}>
                {FILE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {draft.personChoice === OTHER && (
        <label className="block space-y-1" htmlFor={`${idPrefix}-other`}>
          <span className="text-xs font-bold text-navy">Their name</span>
          <input
            id={`${idPrefix}-other`}
            className="input"
            value={draft.personOther}
            onChange={(e) => set({ personOther: e.target.value })}
            maxLength={80}
            required
            disabled={disabled}
          />
        </label>
      )}
      <label className="block space-y-1" htmlFor={`${idPrefix}-title`}>
        <span className="text-xs font-bold text-navy">Name for this file</span>
        <input
          id={`${idPrefix}-title`}
          className="input"
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder={FILE_KIND_LABEL[draft.kind]}
          maxLength={120}
          disabled={disabled}
        />
      </label>
      <label className="block space-y-1" htmlFor={`${idPrefix}-date`}>
        <span className="text-xs font-bold text-navy">
          Date on the form <span className="font-normal text-muted">(optional)</span>
        </span>
        <input
          id={`${idPrefix}-date`}
          type="date"
          className="input"
          value={draft.formDate}
          max={today || undefined}
          onChange={(e) => set({ formDate: e.target.value })}
          disabled={disabled}
          aria-describedby={isMedical(draft.kind) ? `${idPrefix}-date-help` : undefined}
        />
        {isMedical(draft.kind) && (
          <span id={`${idPrefix}-date-help`} className="block text-[11px] text-muted">
            Medical forms are good for 12 months from this date. We&apos;ll show when it expires.
          </span>
        )}
      </label>
    </>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
export default function DeviceFiles({
  ownerUserKey,
  familyKey,
  people,
  initialPerson,
}: {
  ownerUserKey: string;
  familyKey: string;
  people: FamilyPerson[];
  initialPerson?: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [files, setFiles] = useState<DeviceFile[]>([]);
  const [others, setOthers] = useState(0);
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [today, setToday] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canShare = useSyncExternalStore(noSubscribe, detectShare, () => false);
  const standaloneIos = useSyncExternalStore(
    noSubscribe,
    () => (navigator as Navigator & { standalone?: boolean }).standalone === true,
    () => false,
  );

  // Add a file
  const [picked, setPicked] = useState<File | null>(null);
  const [shrink, setShrink] = useState(true);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(people, undefined, initialPerson));
  const addInput = useRef<HTMLInputElement>(null);

  // Per-file actions
  const [viewing, setViewing] = useState<{ id: string; url: string; pdf: boolean } | null>(null);
  const [editing, setEditing] = useState<{ id: string; draft: Draft } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const openedUrls = useRef(new Set<string>());

  const reload = useCallback(async () => {
    const [list, other, info] = await Promise.all([listFiles(ownerUserKey), countOtherOwners(ownerUserKey), storageInfo()]);
    setFiles(list);
    setOthers(other);
    setStorage(info);
    setToday(easternDate(Date.now()));
    setStatus("ready");
  }, [ownerUserKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceFilesSupported()) throw new Error("unsupported");
      await reload();
    })().catch(() => {
      if (!cancelled) setStatus("unavailable");
    });
    saveForOffline();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Object URLs opened in other tabs are released when leaving the page.
  useEffect(() => {
    const urls = openedUrls.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function say(ok: string | null, err: string | null = null) {
    setNotice(ok);
    setError(err);
  }

  async function run(work: () => Promise<string | null>) {
    setBusy(true);
    say(null);
    try {
      const done = await work();
      await reload();
      setNotice(done);
    } catch (e) {
      setError(message(e));
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  // ----- add -----
  function onPick(f: File | undefined) {
    say(null);
    if (!f) return setPicked(null);
    if (!okType(f)) {
      setPicked(null);
      if (addInput.current) addInput.current.value = "";
      return setError("Choose a PDF or a photo.");
    }
    setPicked(f);
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return setError("Choose a file or take a photo first.");
    const details = detailsFrom(draft);
    if (!details.person.trim()) return setError("Type the name of who it's for.");
    await run(async () => {
      const blob = await prepare(picked, shrink);
      if (blob.size > MAX_FILE_BYTES) {
        throw new DeviceFilesError(`That file is ${fmtBytes(blob.size)}. Files can be up to 15 MB.`, "failed");
      }
      const first = files.length === 0;
      await addFile({ ownerUserKey, familyKey }, details, blob);
      setPicked(null);
      setDraft({ ...draftFrom(people, undefined, details.person), kind: details.kind });
      if (addInput.current) addInput.current.value = "";
      // Ask the browser to keep these. Most browsers decide without asking you.
      const kept = await requestPersist();
      const extra = !first
        ? ""
        : kept === true
          ? " Your browser agreed to keep your saved files."
          : kept === false
            ? " Your browser didn't promise to keep it, so save a backup with Share too."
            : "";
      return `Saved on this phone.${extra}`;
    });
  }

  // ----- view, share, download -----
  function closeView() {
    if (viewing) URL.revokeObjectURL(viewing.url);
    setViewing(null);
  }

  function view(f: DeviceFile) {
    if (viewing?.id === f.id) return closeView();
    if (viewing) URL.revokeObjectURL(viewing.url);
    const url = URL.createObjectURL(f.blob);
    if (f.mimeType === "application/pdf" && !standaloneIos) {
      // Opens in a new tab while the tap still counts, so pop-up blockers allow it.
      openedUrls.current.add(url);
      const w = window.open(url, "_blank");
      if (w) {
        setViewing(null);
        return;
      }
      openedUrls.current.delete(url);
    }
    setViewing({ id: f.id, url, pdf: f.mimeType === "application/pdf" });
  }

  function download(f: DeviceFile) {
    const url = URL.createObjectURL(f.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(f);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function share(f: DeviceFile) {
    say(null);
    // Built from the copy already in memory so the share sheet opens right on the tap.
    const file = new File([f.blob], fileName(f), { type: f.mimeType });
    // Files only: adding text makes iPhone save an extra note file next to it in Files.
    const data: ShareData = { files: [file] };
    if (canShare && navigator.canShare(data)) {
      navigator.share(data).catch((e: unknown) => {
        if ((e as { name?: string })?.name === "AbortError") return; // closed the share sheet
        download(f);
      });
      return;
    }
    download(f);
  }

  // ----- edit, replace, delete -----
  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const details = detailsFrom(editing.draft);
    if (!details.person.trim()) return setError("Type the name of who it's for.");
    await run(async () => {
      await updateDetails(ownerUserKey, editing.id, details);
      setEditing(null);
      return "Changes saved.";
    });
  }

  function startReplace(id: string) {
    say(null);
    setReplaceTarget(id);
    replaceInput.current?.click();
  }

  async function onReplacePicked(f: File | undefined) {
    const id = replaceTarget;
    if (replaceInput.current) replaceInput.current.value = "";
    setReplaceTarget(null);
    if (!f || !id) return;
    if (!okType(f)) return setError("Choose a PDF or a photo.");
    await run(async () => {
      const blob = await prepare(f, true);
      if (viewing?.id === id) closeView();
      await replaceFile(ownerUserKey, id, blob);
      return "File replaced.";
    });
  }

  async function onDelete(id: string) {
    await run(async () => {
      if (viewing?.id === id) closeView();
      await deleteFile(ownerUserKey, id);
      setConfirmDelete(null);
      return "Deleted from this phone.";
    });
  }

  async function onDeleteAll() {
    await run(async () => {
      closeView();
      const n = await deleteAllForOwner(ownerUserKey);
      setConfirmAll(false);
      setEditing(null);
      return n ? `Removed ${n} file${n === 1 ? "" : "s"} from this phone.` : "Nothing was saved here.";
    });
  }

  // ----- grouping -----
  const groups: { person: string; detail: string | null; files: DeviceFile[] }[] = [];
  for (const p of people) {
    const mine = files.filter((f) => samePerson(f.person, p.name));
    if (mine.length) groups.push({ person: p.name, detail: p.detail, files: mine });
  }
  const rest = files.filter((f) => !people.some((p) => samePerson(f.person, p.name)));
  for (const name of [...new Set(rest.map((f) => f.person))].sort((a, b) => a.localeCompare(b))) {
    groups.push({ person: name, detail: null, files: rest.filter((f) => f.person === name) });
  }
  const total = files.reduce((n, f) => n + f.size, 0);

  return (
    <>
      <section className="card space-y-2 border-t-4 border-t-pine">
        <p className="flex items-center gap-2 text-sm font-bold text-pine-950">
          <Smartphone className="h-4 w-4 shrink-0 text-pine" aria-hidden /> Your copies, kept only on this device
        </p>
        <p className="text-sm text-ink">
          Keep photos or scans of medical forms, insurance cards and other papers handy for next year or for a campout.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted">
          <li>
            <b className="text-ink">They stay on this phone or computer only.</b> Nothing is uploaded, and the pack never sees
            them.
          </li>
          <li>
            They&apos;re tied to this browser. On iPhone, the home-screen app and Safari each keep their own separate copy.
          </li>
          <li>
            Deleting the app or clearing website data deletes them too. Keep a backup: tap <b>Share</b> on a file, then{" "}
            <b>Save to Files</b>.
          </li>
          <li>
            You still need to give the paper medical form to the campout leader, then tap <b>I turned it in</b> under Me → Medical forms.
          </li>
        </ul>
      </section>

      <div aria-live="polite" className="empty:hidden">
        {notice && (
          <p className="flex items-start gap-2 rounded-2xl border border-mint-200 bg-mint p-3 text-sm text-pine">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{notice}</span>
          </p>
        )}
      </div>
      <div role="alert" className="empty:hidden">
        {error && (
          <p className="flex items-start gap-2 rounded-2xl border border-danger-50 bg-danger-50 p-3 text-sm text-danger">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> <span>{error}</span>
          </p>
        )}
      </div>

      {status === "loading" && (
        <div className="card space-y-3" aria-busy="true">
          <div className="skeleton h-4 w-1/2" />
          <div className="skeleton h-4 w-full" />
          <span className="sr-only">Loading your saved files…</span>
        </div>
      )}

      {status === "unavailable" && (
        <section className="card space-y-1">
          <h2 className="section-title">Can&apos;t save files here</h2>
          <p className="text-sm text-muted">
            This browser won&apos;t let the app keep files on this device. Private browsing and some privacy settings turn it
            off. Try a regular (not private) window, or another browser.
          </p>
        </section>
      )}

      {status === "ready" && (
        <>
          <p className="flex items-start gap-2 px-1 text-xs text-muted">
            <HardDrive className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {files.length} file{files.length === 1 ? "" : "s"} ({fmtBytes(total)})
              {storage?.usage != null ? ` · Using ${fmtBytes(storage.usage)} on this device in all` : ""}
              {" · "}
              {storage?.persisted === true ? (
                <span className="font-semibold text-pine">
                  <ShieldCheck className="mr-0.5 inline h-3 w-3 align-[-1px]" aria-hidden />
                  Kept safe: the browser won&apos;t clear these on its own
                </span>
              ) : storage?.persisted === false ? (
                "Not protected yet: the browser could clear these if the device runs low on space"
              ) : (
                "This browser doesn't say whether it will keep them"
              )}
            </span>
          </p>

          {groups.map((g, gi) => (
            <section key={g.person} className="card space-y-2" aria-labelledby={`files-group-${gi}`}>
              <h2 id={`files-group-${gi}`} className="section-title">
                {g.person}
                {g.detail ? <span className="font-bold normal-case tracking-normal"> · {g.detail}</span> : null}
              </h2>
              <ul className="divide-y divide-line">
                {g.files.map((f) => {
                  const pdf = f.mimeType === "application/pdf";
                  const expires = isMedical(f.kind) && f.formDate ? formExpiresOn(f.formDate) : null;
                  const state = expires ? expiryState(expires, today) : null;
                  const isEditing = editing?.id === f.id;
                  return (
                    <li key={f.id} className="space-y-2 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-start gap-2">
                          {pdf ? (
                            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-pine" aria-hidden />
                          ) : (
                            <ImageIcon className="mt-0.5 h-5 w-5 shrink-0 text-pine" aria-hidden />
                          )}
                          <span className="min-w-0">
                            <span className="block break-words font-semibold text-ink">{f.title}</span>
                            <span className="block text-[11px] text-muted">
                              {FILE_KIND_LABEL[f.kind]}
                              {f.formDate ? ` · dated ${fmtShortDate(f.formDate)}` : ""}
                              {expires ? ` · good through ${fmtShortDate(expires)}` : ""}
                              {` · ${pdf ? "PDF" : "Photo"}, ${fmtBytes(f.size)}`}
                            </span>
                            {isMedical(f.kind) && !f.formDate && (
                              <span className="block text-[11px] text-muted">Add the date on the form to see when it expires.</span>
                            )}
                          </span>
                        </span>
                        {state && state !== "current" && (
                          <span className={`badge shrink-0 normal-case tracking-normal ${EXPIRY_STYLE[state]}`}>{EXPIRY_LABEL[state]}</span>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => view(f)} aria-expanded={viewing?.id === f.id}>
                          {viewing?.id === f.id ? <EyeOff className="h-3.5 w-3.5" aria-hidden /> : <Eye className="h-3.5 w-3.5" aria-hidden />}
                          {viewing?.id === f.id ? "Hide" : "View"}
                        </button>
                        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => share(f)}>
                          {canShare ? <Share2 className="h-3.5 w-3.5" aria-hidden /> : <Download className="h-3.5 w-3.5" aria-hidden />}
                          {canShare ? "Share or save to Files" : "Download"}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost px-3 py-1.5 text-xs"
                          onClick={() => {
                            say(null);
                            setConfirmDelete(null);
                            setEditing(isEditing ? null : { id: f.id, draft: draftFrom(people, f) });
                          }}
                          aria-expanded={isEditing}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit details
                        </button>
                        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => startReplace(f.id)} disabled={busy}>
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Replace file
                        </button>
                        <button
                          type="button"
                          className="btn-ghost border-danger px-3 py-1.5 text-xs text-danger"
                          onClick={() => {
                            setEditing(null);
                            setConfirmDelete(f.id);
                          }}
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete
                        </button>
                      </div>

                      {viewing?.id === f.id &&
                        (viewing.pdf ? (
                          <div className="space-y-1">
                            <iframe src={viewing.url} title={f.title} className="h-[70vh] w-full rounded-xl border border-line bg-card" />
                            <p className="text-[11px] text-muted">
                              Only seeing part of it? Tap <b>{canShare ? "Share or save to Files" : "Download"}</b> to open the whole PDF.
                            </p>
                          </div>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={viewing.url} alt={f.title} className="w-full rounded-xl border border-line bg-card" />
                        ))}

                      {confirmDelete === f.id && (
                        <div className="space-y-2 rounded-xl border border-danger-50 bg-danger-50/40 p-3" role="group" aria-label="Confirm delete">
                          <p className="text-sm text-ink">
                            Delete <b>{f.title}</b> from this phone? This can&apos;t be undone.
                          </p>
                          <div className="flex gap-2">
                            <button type="button" className="btn-primary flex-1 bg-alarm py-2" onClick={() => onDelete(f.id)} disabled={busy}>
                              Yes, delete it
                            </button>
                            <button type="button" className="btn-ghost flex-1 py-2" onClick={() => setConfirmDelete(null)}>
                              Keep it
                            </button>
                          </div>
                        </div>
                      )}

                      {isEditing && (
                        <form onSubmit={onSaveEdit} className="space-y-3 rounded-xl bg-surface-low p-3">
                          <DetailsFields
                            idPrefix={`edit-${f.id}`}
                            draft={editing.draft}
                            setDraft={(d) => setEditing({ id: f.id, draft: d })}
                            people={people}
                            today={today}
                            disabled={busy}
                          />
                          <div className="flex gap-2">
                            <button type="submit" className={`btn-primary flex-1 py-2 ${busy ? "is-busy" : ""}`} disabled={busy}>
                              Save changes
                            </button>
                            <button type="button" className="btn-ghost flex-1 py-2" onClick={() => setEditing(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <input
            ref={replaceInput}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => onReplacePicked(e.target.files?.[0])}
          />

          <section className="card space-y-3" aria-labelledby="add-file-title">
            <h2 id="add-file-title" className="section-title flex items-center gap-1.5">
              <FilePlus className="h-4 w-4" aria-hidden /> {files.length ? "Add another file" : "Add a file"}
            </h2>
            <form onSubmit={onAdd} className="space-y-3">
              <label className="block space-y-1" htmlFor="add-file-input">
                <span className="text-xs font-bold text-navy">Choose a PDF, or take or pick a photo</span>
                <input
                  id="add-file-input"
                  ref={addInput}
                  type="file"
                  accept="application/pdf,image/*"
                  className="block w-full text-sm text-ink file:mr-3 file:rounded-xl file:border-0 file:bg-mint file:px-3 file:py-2 file:text-sm file:font-bold file:text-pine"
                  onChange={(e) => onPick(e.target.files?.[0])}
                  disabled={busy}
                  aria-describedby="add-file-help"
                />
                <span id="add-file-help" className="block text-[11px] text-muted">
                  Up to 15 MB. Photos of a paper form work fine; lay it flat in good light.
                </span>
              </label>
              {picked && picked.type.startsWith("image/") && (
                <label className="flex items-start gap-2 text-sm text-ink">
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-pine" checked={shrink} onChange={(e) => setShrink(e.target.checked)} />
                  <span>
                    Make big photos smaller to save space
                    <span className="block text-[11px] text-muted">Still easy to read. Turn off to keep the full-size photo.</span>
                  </span>
                </label>
              )}
              <DetailsFields idPrefix="add" draft={draft} setDraft={setDraft} people={people} today={today} disabled={busy} />
              <button type="submit" className={`btn-primary w-full ${busy ? "is-busy" : ""}`} disabled={busy || !picked}>
                <Smartphone className="h-4 w-4" aria-hidden /> Save on this phone
              </button>
            </form>
          </section>

          {standaloneIos && (
            <p className="px-1 text-[11px] text-muted">
              Tip: to open a PDF full screen in Files or Books, tap <b>Share or save to Files</b>.
            </p>
          )}

          <section className="card space-y-2" aria-labelledby="remove-all-title">
            <h2 id="remove-all-title" className="section-title">
              Handing this device to someone else?
            </h2>
            <p className="text-xs text-muted">
              Other people who sign in here can&apos;t see your files, but you can remove them first. Signing out doesn&apos;t
              delete them.
              {others > 0 ? ` (${others} file${others === 1 ? "" : "s"} saved by another account on this device ${others === 1 ? "is" : "are"} hidden from you.)` : ""}
            </p>
            {!confirmAll ? (
              <button
                type="button"
                className="btn-ghost w-full border-danger text-danger"
                onClick={() => setConfirmAll(true)}
                disabled={busy || files.length === 0}
              >
                <Trash2 className="h-4 w-4" aria-hidden /> Remove everything saved on this phone
              </button>
            ) : (
              <div className="space-y-2 rounded-xl border border-danger-50 bg-danger-50/40 p-3" role="group" aria-label="Confirm remove everything">
                <p className="text-sm text-ink">
                  Remove all {files.length} of your file{files.length === 1 ? "" : "s"} from this phone? This can&apos;t be undone.
                  Save backups with Share first if you want to keep them.
                </p>
                <div className="flex gap-2">
                  <button type="button" className="btn-primary flex-1 bg-alarm py-2" onClick={onDeleteAll} disabled={busy}>
                    Yes, remove them
                  </button>
                  <button type="button" className="btn-ghost flex-1 py-2" onClick={() => setConfirmAll(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
