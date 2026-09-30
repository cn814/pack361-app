"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, ImagePlus, TriangleAlert } from "lucide-react";
import { uploadPhoto } from "@/app/(app)/photos/actions";

/** Re-draw the photo at a smaller size. Re-encoding drops location (GPS) and camera data. */
async function shrink(file: File, max: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that photo"))), "image/jpeg", quality),
  );
}

export default function PhotoUploader({
  events,
  defaultEventId,
  leader,
}: {
  events: { id: string; title: string; when: string }[];
  defaultEventId?: string;
  leader: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [eventId, setEventId] = useState(defaultEventId ?? "");
  const [caption, setCaption] = useState("");
  const [ok, setOk] = useState(false);
  const [progress, setProgress] = useState<{ done: number; failed: number } | null>(null);
  const [finished, setFinished] = useState<{ sent: number; failed: number } | null>(null);
  const busy = progress !== null;

  async function upload() {
    setFinished(null);
    let done = 0;
    let failed = 0;
    setProgress({ done, failed });
    for (const f of files) {
      try {
        const form = new FormData();
        form.set("full", await shrink(f, 2048, 0.82), "photo.jpg");
        form.set("thumb", await shrink(f, 480, 0.75), "thumb.jpg");
        form.set("event_id", eventId);
        form.set("caption", caption);
        const res = await uploadPhoto(form);
        if (res.error) failed++;
        else done++;
      } catch {
        failed++;
      }
      setProgress({ done, failed });
    }
    setProgress(null);
    setFinished({ sent: done, failed });
    setFiles([]);
    setCaption("");
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

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline bg-surface-low p-6 text-center">
        <ImagePlus className="h-8 w-8 text-pine" aria-hidden />
        <span className="font-bold text-pine">{files.length ? `${files.length} photo${files.length > 1 ? "s" : ""} chosen` : "Choose photos"}</span>
        <span className="text-xs text-muted">Up to 20 at a time</span>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 20))}
        />
      </label>

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

      <label className="flex items-start gap-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-800">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-pine" disabled={busy} />
        <span>
          These are from a pack or den activity, every scout shown is in appropriate clothing, and no names, uniforms with
          full names, school names or home addresses are readable.
        </span>
      </label>

      <button type="button" className={`btn-primary w-full ${busy ? "is-busy" : ""}`} disabled={!files.length || !ok || busy} onClick={upload}>
        {progress ? `Uploading ${progress.done + progress.failed + 1} of ${files.length}…` : `Upload ${files.length || ""} photo${files.length === 1 ? "" : "s"}`}
      </button>

      {finished && finished.sent > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-pine">
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {leader
            ? `${finished.sent} photo${finished.sent > 1 ? "s" : ""} added to the album.`
            : `Thanks! ${finished.sent} photo${finished.sent > 1 ? "s" : ""} sent. A leader checks each one before it appears in the album.`}
        </p>
      )}
      {finished && finished.failed > 0 && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {finished.failed} photo
          {finished.failed > 1 ? "s" : ""} couldn&apos;t be uploaded. Try those again.
        </p>
      )}
    </div>
  );
}
