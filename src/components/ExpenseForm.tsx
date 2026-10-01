"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { Camera, TriangleAlert } from "lucide-react";
import { Field, type ActionResult } from "@/components/ActionForm";
import { cancelReceiptUpload, prepareReceiptUpload } from "@/app/(app)/reimburse/actions";
import { PAID_VIA_LABEL, PAY_ME_BY_LABEL, RECEIPT_ACCEPT, RECEIPT_HELP, checkReceipt, receiptTypeFor, type PaidVia, type PayMeBy } from "@/lib/finance";

export interface ExpenseFormValues {
  id: string;
  description: string;
  vendor: string | null;
  spent_on: string;
  amount: string;
  category_id: string | null;
  event_id: string | null;
  den_id: string | null;
  paid_by: "pack" | "member";
  status: string;
  pay_me_by: PayMeBy | null;
  note: string | null;
  review_note: string | null;
  receipt_name: string | null;
  paid_via: PaidVia | null;
  paid_on: string | null;
  paid_ref: string | null;
  who: string;
}

type Option = { id: string; name: string };

/** Shrink a big photo (or one the browser can read but the pack can't store, like HEIC) to a JPEG. */
async function shrinkPhoto(file: File): Promise<File> {
  const okType = receiptTypeFor(file.name);
  const isPhoto = file.type.startsWith("image/") || /\.(heic|heif)$/i.test(file.name);
  if (!isPhoto || (okType && file.size <= 3 * 1024 * 1024)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]*$/, "") || "receipt"}.jpg`, { type: "image/jpeg" });
  } catch {
    return file; // the checks below explain what to do
  }
}

/**
 * Add or change an expense. Members ask to be paid back (a receipt is required); leadership
 * also records what the pack paid for directly. The receipt goes straight from the browser to
 * storage, then the details are saved.
 */
export default function ExpenseForm({
  mode,
  action,
  values,
  categories,
  events,
  dens,
  adults = [],
  today,
  submitLabel,
  back,
}: {
  mode: "member" | "leader";
  action: (prev: ActionResult, form: FormData) => Promise<ActionResult>;
  values?: ExpenseFormValues;
  categories: Option[];
  events: Option[];
  dens: Option[];
  /** Leadership only: who can be owed money (new expenses). */
  adults?: Option[];
  today: string;
  submitLabel?: string;
  /** Where to go after saving (leadership pages). */
  back?: string;
}) {
  const [state, formAction, saving] = useActionState<ActionResult, FormData>(action, {});
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [who, setWho] = useState(values ? (values.paid_by === "pack" ? "pack" : "member") : mode === "leader" ? "pack" : "member");
  const [alreadyPaid, setAlreadyPaid] = useState(values?.status === "paid");
  const [spentOn, setSpentOn] = useState(values?.spent_on ?? today);
  const busy = uploading || saving;
  const leader = mode === "leader";
  const showPaid = leader && (who === "pack" || (who !== "pack" && alreadyPaid));

  async function pick(f: File | null) {
    setProblem(null);
    if (!f) return setFile(null);
    const ready = await shrinkPhoto(f);
    const bad = checkReceipt(ready.name, ready.size);
    if (bad) {
      setFile(null);
      return setProblem(/\.(heic|heif)$/i.test(f.name) ? "That photo format can't be read here. Take a screenshot of it, or save it as a JPEG." : bad);
    }
    setFile(ready);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProblem(null);
    const fd = new FormData(e.currentTarget);
    fd.delete("file");
    if (!leader && !values && !file) return setProblem("Add a photo or PDF of the receipt.");
    if (file) {
      setUploading(true);
      try {
        const prep = await prepareReceiptUpload(file.name, file.size);
        if ("error" in prep) throw new Error(prep.error);
        const res = await fetch(prep.url, {
          method: "PUT",
          headers: { "content-type": prep.mime, "x-upsert": "false", "cache-control": "max-age=3600" },
          body: new Blob([file], { type: prep.mime }),
        });
        if (!res.ok) {
          await cancelReceiptUpload(prep.path).catch(() => {});
          throw new Error(res.status === 413 ? "That receipt is over 10 MB." : "The upload didn't go through. Check your connection and try again.");
        }
        fd.set("receipt_path", prep.path);
        fd.set("receipt_name", file.name);
      } catch (err) {
        setUploading(false);
        return setProblem(err instanceof Error && err.message ? err.message : "The upload didn't go through. Try again.");
      }
      setUploading(false);
    }
    startTransition(() => formAction(fd));
  }

  const error = problem ?? (!busy ? state.error : null);

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {values && <input type="hidden" name="id" value={values.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <Field label="What did you buy?">
        <input className="input" name="description" required maxLength={200} defaultValue={values?.description ?? ""} placeholder="Snacks for the Wolf den meeting" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Amount">
          <input className="input" name="amount" required inputMode="decimal" defaultValue={values?.amount ?? ""} placeholder="$45.99" />
        </Field>
        <Field label="Date on the receipt">
          <input className="input" type="date" name="spent_on" required max={today} value={spentOn} onChange={(e) => setSpentOn(e.target.value)} />
        </Field>
      </div>
      <Field label="Store or website (optional)">
        <input className="input" name="vendor" maxLength={100} defaultValue={values?.vendor ?? ""} placeholder="Giant, Amazon, Michaels…" />
      </Field>
      <Field label={leader ? "Budget category" : "What it was for (optional)"}>
        <select className="input" name="category_id" defaultValue={values?.category_id ?? ""} required={leader}>
          <option value="">{leader ? "Choose a category" : "Not sure (the treasurer will pick)"}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Event (optional)">
          <select className="input" name="event_id" defaultValue={values?.event_id ?? ""}>
            <option value="">None</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Den (optional)">
          <select className="input" name="den_id" defaultValue={values?.den_id ?? ""}>
            <option value="">Whole pack</option>
            {dens.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {leader && !values && (
        <Field label="Who paid?">
          <select className="input" name="who" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="pack">The pack (pack card, check or cash)</option>
            {adults.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} (to be paid back)
              </option>
            ))}
          </select>
        </Field>
      )}
      {leader && values && (
        <p className="rounded-xl bg-surface-low p-3 text-sm text-ink">
          <span className="block text-xs font-bold text-navy">Who paid</span>
          {values.who}
        </p>
      )}
      {leader && !values && who !== "pack" && (
        <label className="flex items-center gap-2 text-sm font-semibold text-ink">
          <input type="checkbox" name="already_paid" checked={alreadyPaid} onChange={(e) => setAlreadyPaid(e.target.checked)} className="h-4 w-4" />
          Already paid back
        </label>
      )}
      {showPaid && (
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-low p-3">
          <Field label={who === "pack" ? "Paid with" : "Paid back by"}>
            <select className="input" name="paid_via" defaultValue={values?.paid_via ?? (who === "pack" ? "card" : "check")}>
              {(Object.keys(PAID_VIA_LABEL) as PaidVia[]).map((k) => (
                <option key={k} value={k}>
                  {PAID_VIA_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid on">
            <input className="input" type="date" name="paid_on" required max={today} defaultValue={values?.paid_on ?? today} />
          </Field>
          <div className="col-span-2">
            <Field label="Check number or reference (optional)">
              <input className="input" name="paid_ref" maxLength={60} defaultValue={values?.paid_ref ?? ""} />
            </Field>
          </div>
        </div>
      )}

      {!leader && (
        <>
          <Field label="How would you like to be paid back?">
            <select className="input" name="pay_me_by" required defaultValue={values?.pay_me_by ?? "check"}>
              {(Object.keys(PAY_ME_BY_LABEL) as PayMeBy[]).map((k) => (
                <option key={k} value={k}>
                  {PAY_ME_BY_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Note for the treasurer (optional)">
            <textarea className="input min-h-20" name="note" maxLength={500} defaultValue={values?.note ?? ""} placeholder="Anything they should know" />
          </Field>
          <p className="text-xs text-muted">Don&apos;t put bank account numbers here. The treasurer will reach out if they need more.</p>
        </>
      )}
      {leader && (
        <Field label="Note (optional)" hint={who === "pack" ? undefined : "The person being paid back can see this note."}>
          <textarea className="input min-h-16" name="review_note" maxLength={500} defaultValue={values?.review_note ?? ""} />
        </Field>
      )}

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-outline bg-surface-low p-4 text-center">
        <Camera className="h-6 w-6 text-pine" aria-hidden />
        <span className="font-bold text-pine">
          {file ? file.name : values?.receipt_name ? "Replace the receipt (optional)" : leader ? "Add the receipt (optional)" : "Add the receipt"}
        </span>
        <span className="text-xs text-muted">{file ? "Ready to upload" : values?.receipt_name ? `Now: ${values.receipt_name}` : RECEIPT_HELP}</span>
        <input
          type="file"
          name="file"
          accept={RECEIPT_ACCEPT}
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            void pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>

      <button className={`btn-primary w-full ${busy ? "is-busy" : ""}`} disabled={busy}>
        {uploading ? "Uploading the receipt…" : saving ? "Saving…" : (submitLabel ?? "Save")}
      </button>
      {error && (
        <p className="flex items-start gap-1.5 text-sm font-semibold text-danger">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </form>
  );
}
