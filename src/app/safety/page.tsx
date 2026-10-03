import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Database, EyeOff, KeyRound, Phone, ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = { title: "Safety and privacy" };

function Section({ icon: Icon, title, items }: { icon: typeof ShieldCheck; title: string; items: React.ReactNode[] }) {
  return (
    <section className="card space-y-2">
      <h2 className="flex items-center gap-2 font-extrabold text-pine-950">
        <Icon className="h-5 w-5 shrink-0 text-pine" aria-hidden /> {title}
      </h2>
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink marker:text-sage">
        {items.map((i, n) => (
          <li key={n}>{i}</li>
        ))}
      </ul>
    </section>
  );
}

export default function SafetyPage() {
  return (
    <main className="mx-auto w-full max-w-md space-y-4 px-4 py-8">
      <Link href="/login" className="inline-flex items-center gap-1 text-sm font-semibold text-pine">
        <ChevronLeft className="h-4 w-4" aria-hidden /> Sign in
      </Link>
      <header className="space-y-2">
        <span className="badge bg-mint text-pine">
          <ShieldCheck className="h-3 w-3" aria-hidden /> Youth protection first
        </span>
        <h1 className="text-2xl font-extrabold tracking-tight text-pine-950">How we keep Pack 361 families safe</h1>
        <p className="text-sm text-muted">
          This app was built for Pack 361 families to follow Scouting America&apos;s Youth Protection (Safeguarding Youth)
          policies and its guidance on digital privacy. Scoutbook remains the official record for advancement.
        </p>
      </header>

      <Section
        icon={ShieldCheck}
        title="Following Youth Protection rules"
        items={[
          "No one-on-one digital contact: the app has no private messaging. Leaders post announcements to the whole pack or to one den's parents, and nothing is ever sent to scouts.",
          "Scouts don't have accounts. Only parents, guardians and registered leaders on the pack roster can sign in.",
          "Leaders' Safeguarding Youth training (renewed every year) and position training are tracked, with reminders before anything expires.",
          "Leaders add the pack's campout rules, such as two-deep leadership and family-only tenting, to campout pages.",
          <>
            The Scouts First Helpline (<a className="font-semibold text-pine underline" href="tel:18447268871">1-844-726-8871</a>) is
            on the Leaders page for anyone with a youth-safety concern.
          </>,
        ]}
      />

      <Section
        icon={Users}
        title="Who can see what"
        items={[
          "No family information is public. The only public pages are the pack's welcome pages at pack361.org, with general information about joining, and this safety page. Everything else requires signing in, and search engines are told not to list it.",
          "Families see only their own scouts' information and advancement.",
          "Den leaders see their own den; pack leadership sees the whole pack for approvals and awards.",
          "Parents' phone numbers and emails aren't shown to other parents. The leader directory lists only leaders.",
          "Your calendar subscription link is private to you and contains pack events plus your scouts' den meetings.",
          "Volunteer sign-ups show other families only your first name and last initial.",
          "Pack photos are visible only to signed-in pack families. A leader approves every photo a parent uploads, and scouts whose families opted out aren't shown.",
          "Pack documents (forms, minutes, packing lists) are visible only to signed-in pack families, and some only to leaders or one den. Files open through links that expire after a minute.",
          "Only Leadership, the Cubmaster and admins see what families owe and pay for dues; den leaders see event sign-ups and store orders. Other parents don't see any of it.",
        ]}
      />

      <Section
        icon={Database}
        title="What we keep, and what we don't"
        items={[
          "We keep: parent and leader names, emails and phone numbers; scout names, dens and BSA member IDs; advancement copied from Scoutbook; den meeting attendance; leader training dates; Scouting America registration expiration dates; volunteer sign-ups; whether each person's medical form is on file and when it expires; what each family owes the pack and what they've paid (amounts, dates, and whether by PayPal, check or cash); poll answers; event RSVPs (who's going and how many); event sign-ups and pack store orders from Givebutter; and pack photos.",
          "For pack dues paid on Givebutter we keep the payer's name and email, the amount, and which family and scouts it was for. Other names, phone numbers and addresses typed on the Givebutter form are used only to match the payment and are never stored.",
          "We don't keep: birthdates, home addresses, medical forms or any medical information, payment card or bank details (PayPal and Givebutter handle payments) or passwords.",
          "The documents library is for pack papers only. Leaders are asked never to upload medical forms, insurance cards or anything with personal details about scouts or families.",
          "Adults can add their own BSA member ID so leaders can match training records from my.scouting.org. Training reports are read on the leader's device: only course dates and member IDs for adults on the roster are saved, and the file itself is never uploaded or stored.",
          "Photos are resized and their location (GPS) data removed before they're stored, and they're deleted automatically after a set time.",
          "When a family leaves the pack, their access is turned off.",
        ]}
      />

      <Section
        icon={KeyRound}
        title="Security"
        items={[
          "No passwords to steal: you sign in with a one-time link or code sent to the email the pack has on file.",
          "Every connection is encrypted (HTTPS), and the database host encrypts stored data.",
          "Access rules are enforced inside the database itself, not just on the screen, and are checked by more than 650 automated tests.",
          "Only designated pack admins can import roster or advancement data or change anyone's role.",
        ]}
      />

      <Section
        icon={EyeOff}
        title="Your choices"
        items={[
          "Phone alerts are off unless you turn them on, and you can turn them off at any time.",
          "Your scout may appear in pack photos unless you opt out (any time, in the app), and anyone can request that a photo be removed. It's hidden right away, and a leader removes it.",
          "Campout pages saved for use without signal stay on your phone only, and are deleted when you sign out.",
          "Files you save on your phone (Me → Saved on this phone) stay on your phone. They're never uploaded and the pack can't see them. Signing out doesn't delete them, so remove them on that page before handing your phone to someone else.",
          "You can update your phone number and the name you go by under Me → My contact info.",
          <>
            To correct or remove your family&apos;s information, email{" "}
            <a className="font-semibold text-pine underline" href="mailto:info@pack361.org">
              info@pack361.org
            </a>
            .
          </>,
        ]}
      />

      <p className="flex items-start gap-2 px-1 text-[11px] text-muted">
        <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        This app is run by Pack 361 volunteers. It isn&apos;t an official Scouting America product.
      </p>
    </main>
  );
}
