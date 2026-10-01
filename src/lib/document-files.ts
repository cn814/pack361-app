// File rules for the pack documents library, shared by the upload form (browser) and the
// server actions. The storage bucket enforces the same size and types (see the
// 20261002000100_documents migration).

export const DOCS_BUCKET = "pack-docs";
export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/** Allowed extensions and the one content type each is stored with. */
export const DOC_TYPES: Record<string, { mime: string; label: string }> = {
  pdf: { mime: "application/pdf", label: "PDF" },
  doc: { mime: "application/msword", label: "Word" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  xls: { mime: "application/vnd.ms-excel", label: "Excel" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  ppt: { mime: "application/vnd.ms-powerpoint", label: "PowerPoint" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint" },
  txt: { mime: "text/plain", label: "Text" },
  csv: { mime: "text/csv", label: "CSV" },
  jpg: { mime: "image/jpeg", label: "JPEG" },
  jpeg: { mime: "image/jpeg", label: "JPEG" },
  png: { mime: "image/png", label: "PNG" },
  webp: { mime: "image/webp", label: "WebP" },
};

/** For the file picker's accept attribute. */
export const DOC_ACCEPT = Object.keys(DOC_TYPES)
  .map((e) => `.${e}`)
  .join(",");

export const DOC_TYPES_HELP = "PDF, Word, Excel, PowerPoint, text, CSV, or a JPEG, PNG or WebP picture, up to 10 MB.";

export function extOf(name: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** The type a file will be stored as, or null if it isn't allowed. */
export function docTypeFor(name: string): { ext: string; mime: string; label: string } | null {
  const ext = extOf(name);
  const t = DOC_TYPES[ext];
  return t ? { ext, ...t } : null;
}

/** Problem with a picked file, in words for parents, or null if it's fine. */
export function checkDocFile(name: string, size: number): string | null {
  if (!docTypeFor(name)) return `That kind of file can't be added. Use ${DOC_TYPES_HELP}`;
  if (size <= 0) return "That file is empty.";
  if (size > MAX_DOC_BYTES) return "That file is over 10 MB. Try saving a smaller copy (for a PDF, “Reduce file size”).";
  return null;
}

/** Short label for a stored content type ("PDF", "Excel"). */
export function docTypeLabel(mime: string): string {
  return Object.values(DOC_TYPES).find((t) => t.mime === mime)?.label ?? "File";
}

export function fmtBytes(n: number): string {
  if (n < 1000) return `${n} bytes`;
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} KB`;
  return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
}

/** A file name safe to keep and offer back as the download name. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f"<>|*?:]/g, "").trim().slice(-200) || "document";
}

export const DOC_AUDIENCES = {
  everyone: "All pack families",
  leaders: "Leaders only",
  committee: "Pack leadership only",
} as const;
export type DocAudience = keyof typeof DOC_AUDIENCES;

export const DOC_FOLDERS = [
  "Forms",
  "Meeting minutes",
  "Budget & finance",
  "Campouts",
  "Leader resources",
  "Popcorn & fundraising",
];
