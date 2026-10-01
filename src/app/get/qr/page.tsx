import type { Metadata } from "next";
import PrintButton from "@/components/PrintButton";
import { qrSvg } from "@/lib/recruiting";

export const metadata: Metadata = { title: "Get the app: QR code" };

const LINK = "https://app.pack361.org/get";

/** A sign to print for pack meetings and the check-in table: scan to get the app. */
export default async function GetTheAppQr() {
  const qr = await qrSvg(LINK);
  return (
    <main className="mx-auto w-full max-w-[7.5in] space-y-4 px-4 py-6 print:p-0">
      <div className="flex justify-end print:hidden">
        <PrintButton label="Print" />
      </div>
      <article className="card space-y-6 p-10 text-center print:border-0 print:p-0 print:shadow-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/badge.png" alt="" className="mx-auto h-24 w-24 rounded-full" />
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-sage">Cub Scout Pack 361 families</p>
          <h1 className="text-5xl font-extrabold leading-tight tracking-tight text-pine-950">Get the pack app</h1>
          <p className="mt-2 text-xl text-pine">Calendar · RSVPs · Campouts · Advancement · News</p>
        </div>
        <div className="mx-auto w-[3.6in] rounded-2xl bg-white p-3 ring-1 ring-line" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label="QR code for app.pack361.org/get" />
        <ol className="mx-auto max-w-md space-y-2 text-left text-lg text-ink">
          <li>
            <b>1.</b> Point your phone&apos;s camera at the code and tap the link.
          </li>
          <li>
            <b>2.</b> Add it to your home screen: <b>Install</b> on Android, or <b>Share → Add to Home Screen</b> on iPhone.
          </li>
          <li>
            <b>3.</b> Open Pack 361 from the new icon and sign in with the email you gave the pack.
          </li>
        </ol>
        <p className="text-lg font-bold text-pine">app.pack361.org/get</p>
      </article>
    </main>
  );
}
