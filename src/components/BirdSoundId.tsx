"use client";

import { useEffect, useRef, useState } from "react";
import { Bird, LoaderCircle, Mic, Square, TriangleAlert } from "lucide-react";
import { POOL, addHeard, birdnetWeek, hearingNow, pool, type Detection, type Heard } from "@/lib/bird-id";

// Bird sound ID with BirdNET, entirely on the phone: the microphone's sound is analyzed in the
// browser and never sent anywhere. The model (about 56 MB) downloads the first time and is then
// kept on the phone, so it works on the trail without signal (public/birdnet, public/sw.js).

const BASE = "/birdnet/v2.4";
const SAMPLE_RATE = 48000;
const WINDOW = 144000; // 3 seconds
const TICK_MS = 500;
const AUTO_STOP_MS = 10 * 60000; // save the battery

type Phase = "idle" | "loading" | "listening" | "stopped" | "error";

const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function BirdSoundId({ lat, lon }: { lat: number; lon: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState<Detection[]>([]);
  const [heard, setHeard] = useState<Heard[]>([]);

  const worker = useRef<Worker | null>(null);
  const ready = useRef(false);
  const busy = useRef(false);
  const recent = useRef<Detection[][]>([]);
  const audio = useRef<{ ctx: AudioContext; stream: MediaStream; node: AudioWorkletNode } | null>(null);
  const ring = useRef<{ buf: Float32Array; at: number }>({ buf: new Float32Array(WINDOW), at: 0 });
  const timers = useRef<{ tick?: number; stop?: number }>({});
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const listening = useRef(false);

  function stopListening(next: Phase = "stopped") {
    listening.current = false;
    window.clearTimeout(timers.current.tick);
    window.clearTimeout(timers.current.stop);
    const a = audio.current;
    audio.current = null;
    if (a) {
      a.node.port.onmessage = null;
      a.node.disconnect();
      a.stream.getTracks().forEach((t) => t.stop());
      void a.ctx.close();
    }
    void wake.current?.release().catch(() => {});
    wake.current = null;
    setPhase(next);
  }

  // Leaving the page: stop the microphone and the model.
  useEffect(
    () => () => {
      listening.current = false;
      window.clearTimeout(timers.current.tick);
      window.clearTimeout(timers.current.stop);
      audio.current?.stream.getTracks().forEach((t) => t.stop());
      void audio.current?.ctx.close();
      worker.current?.terminate();
    },
    [],
  );

  /** Start the model (once), resolving when it's ready. */
  function loadModel(): Promise<void> {
    if (ready.current && worker.current) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const params = new URLSearchParams({ tf: `${BASE}/tf.min.js`, root: BASE });
      const w = new Worker(`${BASE}/worker.js?${params}`);
      worker.current = w;
      w.onerror = () => reject(new Error("The bird ID couldn't start on this phone."));
      w.onmessage = ({ data }) => {
        switch (data?.message) {
          case "load_model":
          case "warmup":
          case "load_geomodel":
          case "load_labels":
            if (typeof data.progress === "number") setProgress(data.progress);
            break;
          case "loaded":
            ready.current = true;
            // Leave out birds unlikely here this week.
            w.postMessage({ message: "area-scores", latitude: lat, longitude: lon, week: birdnetWeek() });
            resolve();
            break;
          case "pooled": {
            busy.current = false;
            if (!listening.current || !Array.isArray(data.pooled)) break;
            recent.current = [...recent.current, data.pooled as Detection[]].slice(-POOL);
            const current = hearingNow(pool(recent.current));
            setNow(current);
            if (current.length) setHeard((h) => addHeard(h, current, Date.now()));
            break;
          }
        }
      };
    });
  }

  function tick() {
    if (!listening.current) return;
    const w = worker.current;
    if (w && ready.current && !busy.current) {
      const { buf, at } = ring.current;
      const win = new Float32Array(WINDOW);
      for (let i = 0, j = at; i < WINDOW; i++, j = (j + 1) % WINDOW) win[i] = Math.max(-1, Math.min(1, buf[j]));
      busy.current = true;
      w.postMessage({ message: "predict", pcmAudio: win, overlapSec: 1.5 }, [win.buffer]);
    }
    timers.current.tick = window.setTimeout(tick, TICK_MS);
  }

  async function start() {
    setError(null);
    if (!hasWebGL() || typeof AudioWorkletNode === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("error");
      setError("This phone's browser can't run bird ID. Try the Merlin app instead.");
      return;
    }
    try {
      // Ask for the microphone right away (while the tap still counts), then load the model.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      if (ctx.state === "suspended") await ctx.resume();
      setPhase(ready.current ? "listening" : "loading");
      await loadModel();
      await ctx.audioWorklet.addModule(`${BASE}/audio-processor.js`);
      const source = ctx.createMediaStreamSource(stream);
      const highPass = ctx.createBiquadFilter(); // cut wind and footstep rumble
      highPass.type = "highpass";
      highPass.frequency.value = 200;
      const node = new AudioWorkletNode(ctx, "audio-processor");
      ring.current = { buf: new Float32Array(WINDOW), at: 0 };
      node.port.onmessage = ({ data }) => {
        const r = ring.current;
        for (let i = 0; i < data.length; i++) {
          r.buf[r.at] = data[i];
          r.at = (r.at + 1) % WINDOW;
        }
      };
      source.connect(highPass);
      highPass.connect(node);
      node.connect(ctx.destination);
      audio.current = { ctx, stream, node };
      recent.current = [];
      setNow([]);
      listening.current = true;
      setPhase("listening");
      try {
        wake.current = (await (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        // keeping the screen on is a nice-to-have
      }
      timers.current.stop = window.setTimeout(() => stopListening(), AUTO_STOP_MS);
      // The first answer needs three seconds of sound.
      timers.current.tick = window.setTimeout(tick, 3000);
    } catch (e) {
      stopListening("error");
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(
        denied
          ? "The app needs the microphone to hear birds. Allow it in your phone's settings for this site, then try again."
          : e instanceof Error && e.message
            ? e.message
            : "Couldn't start listening. Try again.",
      );
    }
  }

  const sorted = [...heard].sort((a, b) => a.first - b.first);

  return (
    <div className="space-y-3">
      {phase === "listening" ? (
        <button type="button" className="btn-primary w-full bg-danger" onClick={() => stopListening()}>
          <Square className="h-4 w-4" aria-hidden /> Stop listening
        </button>
      ) : (
        <button type="button" className="btn-primary w-full" disabled={phase === "loading"} onClick={() => void start()}>
          {phase === "loading" ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Getting ready… {progress}%
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" aria-hidden /> {heard.length ? "Listen again" : "Listen for birds"}
            </>
          )}
        </button>
      )}
      {phase === "idle" && (
        <p className="text-[11px] text-muted">
          The first time downloads the bird sounds model (about 56 MB, best on Wi-Fi); after that it works without signal. The
          sound stays on your phone.
        </p>
      )}
      {phase === "loading" && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-low" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-pine transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-sm text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}

      {phase === "listening" && (
        <div className="rounded-xl bg-surface-low p-3" aria-live="polite">
          <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.1em] text-muted">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
            </span>
            Hearing now
          </p>
          {now.length ? (
            <ul className="mt-1.5 space-y-1">
              {now.map((d) => (
                <li key={d.index} className="flex items-baseline justify-between gap-2">
                  <span className="font-bold text-ink">{d.commonName}</span>
                  <span className="text-xs font-bold text-pine">{Math.round(d.confidence * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1.5 text-sm text-muted">Listening… hold still and stay quiet for a bit.</p>
          )}
        </div>
      )}

      {sorted.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-extrabold uppercase tracking-[0.1em] text-muted">Heard on this walk</h3>
          <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
            {sorted.map((h) => (
              <li key={h.index} className="flex items-center gap-2.5 px-3 py-2">
                <Bird className="h-4 w-4 shrink-0 text-pine" aria-hidden />
                <div className="min-w-0 flex-1">
                  <a
                    href={`https://www.allaboutbirds.org/guide/${encodeURIComponent(h.name.replace(/[’']/g, "").replace(/\s+/g, "_"))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate font-bold text-ink underline-offset-2 hover:underline"
                  >
                    {h.name}
                  </a>
                  <span className="block truncate text-xs italic text-muted">{h.scientific}</span>
                </div>
                <span className="shrink-0 text-right text-[11px] text-muted">
                  <span className="block font-bold text-pine">{h.best}%</span>
                  {timeFmt.format(new Date(h.first))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-[11px] text-muted">
        Bird sound ID by{" "}
        <a href="https://birdnet.cornell.edu" target="_blank" rel="noopener noreferrer" className="font-bold text-pine underline">
          BirdNET
        </a>{" "}
        (Cornell Lab of Ornithology and Chemnitz University of Technology), CC BY-SA 4.0. It can be wrong; a song heard several
        times is a better bet.
      </p>
    </div>
  );
}
