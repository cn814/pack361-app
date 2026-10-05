"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import type { Organ, PlantMatch } from "@/lib/plant-id";

const PARTS: { value: Organ; label: string }[] = [
  { value: "auto", label: "Not sure" },
  { value: "leaf", label: "Leaf" },
  { value: "flower", label: "Flower" },
  { value: "fruit", label: "Fruit or berry" },
  { value: "bark", label: "Bark" },
];

/** Shrink the photo to 1280 px. Re-encoding as JPEG drops its location (GPS) and camera data. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo"))), "image/jpeg", 0.85));
  } finally {
    bitmap.close();
  }
}

type State =
  | { step: "ready" }
  | { step: "working"; preview: string }
  | { step: "done"; preview: string; matches: PlantMatch[] }
  | { step: "error"; preview: string | null; message: string };

/**
 * Plant ID: take or pick a photo of a leaf, flower, fruit or bark, and Pl@ntNet suggests what it
 * is. The photo is shrunk on the phone first and isn't kept anywhere.
 */
export default function PlantId() {
  const input = useRef<HTMLInputElement>(null);
  const [part, setPart] = useState<Organ>("auto");
  const [state, setState] = useState<State>({ step: "ready" });
  const lastPreview = useRef<string | null>(null);

  async function identify(file: File) {
    let preview: string | null = null;
    try {
      const photo = await shrink(file);
      if (lastPreview.current) URL.revokeObjectURL(lastPreview.current);
      preview = URL.createObjectURL(photo);
      lastPreview.current = preview;
      setState({ step: "working", preview });
      const body = new FormData();
      body.append("image", photo, "plant.jpg");
      body.append("organ", part);
      const res = await fetch("/api/nature/plant", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { matches?: PlantMatch[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Couldn't identify that one. Try again.");
      setState({ step: "done", preview, matches: json.matches ?? [] });
    } catch (e) {
      const message =
        e instanceof TypeError
          ? "No connection. Plant ID needs signal; try again when you have it, or use the Seek app."
          : e instanceof Error && e.message !== "photo"
            ? e.message
            : "Couldn't read that photo. Try taking it with the camera.";
      setState({ step: "error", preview, message });
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const preview = state.step === "ready" ? null : state.preview;

  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-bold text-navy">What&rsquo;s in the photo?</legend>
        <div className="flex flex-wrap gap-1.5">
          {PARTS.map((p) => (
            <label
              key={p.value}
              className="cursor-pointer rounded-full border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink has-[:checked]:border-pine has-[:checked]:bg-mint has-[:checked]:text-pine"
            >
              <input type="radio" name="plant-part" value={p.value} checked={part === p.value} onChange={() => setPart(p.value)} className="sr-only" />
              {p.label}
            </label>
          ))}
        </div>
      </fieldset>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label="Photo of a plant"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void identify(f);
        }}
      />
      <button type="button" className="btn-primary w-full" disabled={state.step === "working"} onClick={() => input.current?.click()}>
        {state.step === "working" ? (
          <>
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Identifying…
          </>
        ) : state.step === "ready" ? (
          <>
            <Camera className="h-4 w-4" aria-hidden /> Take a photo of the plant
          </>
        ) : (
          <>
            <RotateCcw className="h-4 w-4" aria-hidden /> Try another photo
          </>
        )}
      </button>
      <p className="text-[11px] text-muted">Get close: one leaf or flower filling the photo works best. Photos of plants only, please.</p>

      {(state.step === "done" || state.step === "error") && (
        <div className="flex gap-3">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your photo" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          )}
          <div className="min-w-0 flex-1 space-y-2" aria-live="polite">
            {state.step === "error" && (
              <p className="flex items-start gap-1.5 text-sm text-danger">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {state.message}
              </p>
            )}
            {state.step === "done" && state.matches.length === 0 && (
              <p className="text-sm text-ink">No good match. Try a closer photo of a single leaf or flower, and pick what it shows.</p>
            )}
            {state.step === "done" &&
              state.matches.map((m, i) => (
                <div key={m.scientific} className={`flex items-center gap-2.5 ${i === 0 ? "" : "opacity-80"}`}>
                  {m.photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt="" title={m.credit ?? undefined} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg bg-surface-low object-cover" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-bold text-ink ${i === 0 ? "text-base" : "text-sm"}`}>
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                          {m.name}
                        </a>
                      ) : (
                        m.name
                      )}
                    </p>
                    <p className="truncate text-xs italic text-muted">{m.scientific}</p>
                  </div>
                  <span className={`shrink-0 text-sm font-extrabold ${m.percent >= 50 ? "text-pine" : "text-muted"}`}>{m.percent}%</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <p className="rounded-xl bg-gold-50 p-3 text-xs text-gold-800">
        <b>Look, don&rsquo;t touch or taste.</b> Apps can be wrong: never eat a plant or berry an app names, and steer clear of
        leaves of three (poison ivy).
      </p>
      <p className="text-[11px] text-muted">Plant identification by the Pl@ntNet recognition API. Photos aren&rsquo;t stored.</p>
    </div>
  );
}
