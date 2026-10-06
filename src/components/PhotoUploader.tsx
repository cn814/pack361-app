"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, CircleCheck, ImagePlus, TriangleAlert } from "lucide-react";
import { alreadyUploaded, finishUpload, uploadPhoto } from "@/app/(app)/photos/actions";

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

/** Draw a decoded photo at a smaller size. Re-encoding drops location (GPS) and camera data. */
function draw(bitmap: ImageBitmap, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), "image/jpeg", quality),
  );
}

/** Fingerprint of the original file, so the same person can't add the same photo twice ("" if the browser can't). */
async function fingerprint(file: File): Promise<string> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return "";
  }
}

/** Same file picked twice (name, size and date match). */
const sameFile = (a: File, b: File) => a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;

/** Decode once, then make the full-size and thumbnail copies from the same image. */
async function shrinkBoth(file: File): Promise<{ full: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    return { full: await draw(bitmap, 2048, 0.82), thumb: await draw(bitmap, 480, 0.75) };
  } finally {
    bitmap.close();
  }
}

export default function PhotoUploader({
  events,
  defaultEventId,
  leader,
  optOutCount = 0,
  returnTo,
}: {
  events: { id: string; title: string; when: string }[];
  defaultEventId?: string;
  leader: boolean;
  /** Leaders: how many scouts' families opted out of photos (listed above the uploader). */
  optOutCount?: number;
  /** Page to go back to after a successful upload (the event the upload started from). */
  returnTo?: string;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [eventId, setEventId] = useState(defaultEventId ?? "");
  const [caption, setCaption] = useState("");
  const [ok, setOk] = useState(false);
  // Leaders: "None of these scouts are in my photos". Without it, their photos go to review too.
  const [clear, setClear] = useState(false);
  const needsClear = leader && optOutCount > 0;
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);
  const [finished, setFinished] = useState<{ sent: number; failed: number; heic: number; approved: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = progress !== null;

  /** After the picker closes: let iPhone Safari re-settle the page, then show the next step. */
  function picked(f: File[]) {
    // A photo picked twice is only listed once.
    setFiles((cur) => [...cur, ...f.filter((n, i) => !cur.some((c) => sameFile(c, n)) && f.findIndex((m) => sameFile(m, n)) === i)].slice(0, 20));
    setTimeout(() => {
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
      document.getElementById("photo-confirm")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 300);
  }

  async function upload() {
    setFinished(null);
    setError(null);
    let done = 0;
    let failed = 0;
    let heic = 0;
    let approved = 0;
    let skipped = 0;
    const failedFiles: File[] = [];
    setProgress({ done, failed });
    // Photos this person already uploaded are skipped (the database refuses them anyway).
    const hashes: string[] = [];
    for (const f of files) hashes.push(await fingerprint(f)); // one at a time: easy on the phone's memory
    const known = new Set(await alreadyUploaded(hashes.filter(Boolean)).catch(() => [] as string[]));
    const seen = new Set<string>();
    for (const [i, f] of files.entries()) {
      const hash = hashes[i];
      if (hash && (known.has(hash) || seen.has(hash))) {
        skipped++;
        setProgress({ done: done + skipped, failed });
        continue;
      }
      if (hash) seen.add(hash);
      try {
        const { full, thumb } = await shrinkBoth(f);
        const form = new FormData();
        form.set("full", full, "photo.jpg");
        form.set("thumb", thumb, "thumb.jpg");
        form.set("event_id", eventId);
        form.set("caption", caption);
        if (clear) form.set("no_opt_outs", "on");
        if (hash) form.set("hash", hash);
        const res = await uploadPhoto(form);
        if (res.duplicate) {
          skipped++;
          setProgress({ done: done + skipped, failed });
          continue;
        }
        if (res.error) {
          // Same answer for every photo (e.g. a last name in the caption): stop and say so.
          if (res.fatal) {
            setProgress(null);
            setError(res.error);
            return;
          }
          throw new Error(res.error);
        }
        done++;
        if (res.approved) approved++;
      } catch {
        failed++;
        failedFiles.push(f);
        if (isHeic(f)) heic++;
      }
      setProgress({ done: done + skipped, failed });
    }
    if (done > 0) await finishUpload().catch(() => {});
    if (done > 0 && failed === 0 && skipped === 0) {
      // All sent: go back and say so in a pop-up (see components/Toast).
      const back = returnTo ?? `/photos?album=${eventId || "other"}`;
      router.push(`${back}${back.includes("?") ? "&" : "?"}done=${approved === done ? "photos-added" : "photos-sent"}&n=${done}`);
      return;
    }
    // Keep just the ones that didn't go, so "Upload" tries those again.
    setProgress(null);
    setFinished({ sent: done, failed, heic, approved, skipped });
    setFiles(failedFiles);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Which event?</span>
        <select className="input" value={eventId} onChange={(e) => setEventId(e.target.value)} disabled={busy}>
          <option value="">Around the pack (no event)</option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} · {e.when}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline bg-surface-low p-5 text-center">
          <Camera className="h-7 w-7 text-pine" aria-hidden />
          <span className="font-bold text-pine">Take a photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              picked(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline bg-surface-low p-5 text-center">
          <ImagePlus className="h-7 w-7 text-pine" aria-hidden />
          <span className="font-bold text-pine">Choose photos</span>
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              picked(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {files.length > 0 && (
        <p className="flex items-center justify-between text-sm font-semibold text-pine">
          {files.length} photo{files.length > 1 ? "s" : ""} ready (up to 20)
          <button type="button" className="text-xs text-muted underline" onClick={() => setFiles([])} disabled={busy}>
            Clear
          </button>
        </p>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-bold text-navy">Caption (optional)</span>
        <input
          className="input"
          value={caption}
          maxLength={200}
          disabled={busy}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Bear den at the flag ceremony"
        />
        <span className="block text-[11px] text-muted">Please don&apos;t use scouts&apos; last names.</span>
      </label>

      <label id="photo-confirm" className="flex scroll-mb-24 items-start gap-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-800">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-pine" disabled={busy} />
        <span>
          These are from a pack or den activity, every scout shown is in appropriate clothing, and no names, uniforms with
          full names, school names or home addresses are readable.
        </span>
      </label>

      {needsClear && (
        <label className="flex items-start gap-2 rounded-xl bg-danger-50 p-3 text-sm text-danger">
          <input type="checkbox" checked={clear} onChange={(e) => setClear(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-pine" disabled={busy} />
          <span>
            <b>None of these scouts are in my photos.</b> Leave this unticked and your photos wait for review like a family&apos;s.
          </span>
        </label>
      )}

      {error && (
        <p role="alert" className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}

      <button type="button" className={`btn-primary w-full ${busy ? "is-busy" : ""}`} disabled={!files.length || !ok || busy} onClick={upload}>
        {progress ? `Uploading ${progress.done + progress.failed + 1} of ${files.length}…` : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
      </button>

      {finished && finished.sent > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {finished.approved === finished.sent
            ? `${finished.sent} photo${finished.sent > 1 ? "s" : ""} added to the album.`
            : `Thanks! ${finished.sent} photo${finished.sent > 1 ? "s" : ""} sent. A leader checks each one before it appears in the album.`}
        </p>
      )}
      {finished && finished.skipped > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-gold-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {finished.skipped === 1
            ? "1 photo was skipped: you already uploaded it."
            : `${finished.skipped} photos were skipped: you already uploaded them.`}
        </p>
      )}
      {finished && finished.failed > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {finished.failed} photo{finished.failed > 1 ? "s" : ""} couldn&apos;t be uploaded and {finished.failed > 1 ? "are" : "is"} still
            listed above. Tap Upload to try again.
            {finished.heic > 0 &&
              " Some are iPhone HEIC photos, which this browser can't open. Upload them from the iPhone itself, or set the iPhone camera to Most Compatible (Settings → Camera → Formats)."}
          </span>
        </p>
      )}
    </div>
  );
}
