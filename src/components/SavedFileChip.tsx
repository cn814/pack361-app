"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { deviceFilesSupported, isMedical, listFiles, samePerson } from "@/lib/device-files";

/**
 * Next to a person's medical form: whether a copy is saved on this device (see /family/files).
 * Looks only in this browser; shows nothing until it knows, or where files can't be saved.
 */
export default function SavedFileChip({ person, ownerUserKey }: { person: string; ownerUserKey: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!deviceFilesSupported()) return;
      const files = await listFiles(ownerUserKey);
      const has = files.some((f) => isMedical(f.kind) && samePerson(f.person, person));
      if (!cancelled) setSaved(has);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [person, ownerUserKey]);

  if (saved === null) return null;
  return saved ? (
    <Link href="/family/files" className="inline-flex items-center gap-1 text-xs font-bold text-pine">
      Saved on this phone ✓
    </Link>
  ) : (
    <Link href={`/family/files?person=${encodeURIComponent(person)}`} className="inline-flex items-center gap-1 text-xs font-bold text-pine">
      <Smartphone className="h-3.5 w-3.5" aria-hidden /> Save a copy on this phone →
    </Link>
  );
}
