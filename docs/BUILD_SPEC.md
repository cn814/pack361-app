# PACK 361 APP — BUILD SPEC (original screen specs, 2026-09-29)

> Complete architectural, visual, and frontend implementation bundle for building the **Pack 361 Private Member Portal PWA** with **Next.js / Vite + React**, **Tailwind CSS**, and **Supabase**.

---

## TABLE OF CONTENTS
1. [Executive Summary & App Architecture](#1-executive-summary--app-architecture)
2. [Design Tokens & Tailwind Configuration](#2-design-tokens--tailwind-configuration)
3. [App Shell & Navigation Framework](#3-app-shell--navigation-framework)
4. [Supabase Database Schema & RLS](#4-supabase-database-schema--rls)
5. [PWA Configuration (Manifest & Offline Service Worker)](#5-pwa-configuration-manifest--offline-service-worker)
6. [Complete Screen-by-Screen Component Specifications & UI Code](#6-complete-screen-by-screen-component-specifications--ui-code)
   - 6.1 Roster Login & Private Portal Access (`/login`)
   - 6.2 Pack Feed & Home Hub (`/feed`)
   - 6.3 Campout Packing Checklist (`/campouts/packing`)
   - 6.4 Campout Itinerary & Field Map (`/campouts/itinerary`)
   - 6.5 Scoutbook Advancements (`/scoutbook`)
   - 6.6 Den Meeting Hub & At-Home Catch-up (`/den-hub`)
   - 6.7 Volunteer Signup & Committee Roster (`/volunteer`)
   - 6.8 YPT-Compliant Photo Vault (`/vault`)
   - 6.9 Pack Leadership Directory & Contacts (`/leaders`)
   - 6.10 Leader Docs & Scoutbook SOP (`/admin/docs`)
   - 6.11 Add to Home Screen PWA Install Guide (`/install-guide`)
7. [Authentication & Authorization Hooks (React / TypeScript)](#7-authentication--authorization-hooks-react--typescript)

---

# 1. EXECUTIVE SUMMARY & APP ARCHITECTURE

Pack 361 Trailblazers is a private Cub Scout pack mobile web portal and Progressive Web App (PWA).

### Core Goals:
1. **Zero-Password Frictionless Access**: Email magic links via Supabase Auth (SMS codes can come later; they need a paid SMS provider).
2. **Scoutbook Roster Whitelist**: Automated profile verification by cross-referencing parent login emails against a CSV-imported roster table.
3. **Youth Protection (YPT) & COPPA Privacy**: Strict PostgreSQL Row Level Security (RLS) and private storage buckets so scout photos, directory contacts, and advancements remain hidden from public web crawlers.
4. **Offline Resilience**: Offline caching of campout packing checklists and trail maps for state park campsites with zero cellular signal.

---

# 2. DESIGN TOKENS & TAILWIND CONFIGURATION

### Theme Palette (Trailhead Scout)
- **Primary Forest Green**: `#1b4332` (brand anchor, navigation headers, primary buttons)
- **Primary Dark**: `#012d1d` / pressed `#132e22`
- **Campfire Gold** (fills, progress, highlights): `#feba38`
- **Gold Text on light backgrounds**: `#7e5700` (in-progress chips use `#b45309` on `#fef6e7`)
- **Scout Night Navy**: `#1b2638`
- **Surface / Background**: `#faf9f4` (warm canvas)
- **Card**: `#ffffff`, **Surface Low**: `#f5f4ef`
- **Text Main**: `#1b1c19`, **Text Muted**: `#414844`, **Outline**: `#c1c8c2`

> One gold everywhere: `#feba38`. (The original mockups mixed `#E9A825`, `#f59e0b` and `#fbbf24`.)
> The `amber` override below maps Tailwind's `amber-*` classes used in the components onto the same gold.

### `tailwind.config.js`
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          500: '#2d6a4f',
          700: '#1b4332',
          800: '#143527',
          900: '#0f291e',
        },
        gold: {
          50: '#fef6e7',
          100: '#ffdeab',
          500: '#feba38',
          600: '#b45309',
          700: '#7e5700',
        },
        amber: {
          50: '#fef6e7', 100: '#ffdeab', 200: '#ffd28a', 300: '#fec75f', 400: '#feba38',
          500: '#feba38', 600: '#b45309', 700: '#7e5700', 800: '#6e4c00', 900: '#5f4100',
        },
        surface: {
          canvas: '#faf9f4',
          card: '#ffffff',
          alt: '#f5f4ef',
          dim: '#eae8e1',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
      }
    },
  },
  plugins: [],
}
```

---

# 3. APP SHELL & NAVIGATION FRAMEWORK

The mobile shell consists of:
1. **Top App Bar**:
   - Pack logo mark (evergreen tree / scout tent emblem)
   - Pack title: `"Pack 361 Trailblazers"`
   - Current section subtitle / tag (e.g., `"Campouts"`, `"Feed"`)
   - Parent avatar or initial badge with quick profile modal trigger
2. **Main Scrollable Content Window**:
   - `max-w-md mx-auto w-full min-h-screen pb-24 bg-[#faf9f4]`
3. **Bottom Fixed Tab Bar (4 Core Tabs + Active State Indicator)**:
   - **Feed**: Icon: `Home` (`/feed`)
   - **Campouts**: Icon: `Compass / Tent` (`/campouts`)
   - **Scoutbook**: Icon: `Award / Medal` (`/scoutbook`)
   - **Vault**: Icon: `Shield / Camera` (`/vault`)

### App Shell React Component (`components/AppShell.tsx`)
```tsx
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Home, Compass, Award, Shield, Bell } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  activeTab?: 'feed' | 'campouts' | 'scoutbook' | 'vault';
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  title = "Pack 361 Trailblazers",
  subtitle = "Member Portal",
  activeTab = "feed"
}) => {
  return (
    <div className="min-h-screen bg-[#faf9f4] text-stone-900 font-sans flex justify-center selection:bg-forest-100">
      <div className="w-full max-w-md bg-[#faf9f4] min-h-screen flex flex-col relative shadow-xl border-x border-stone-200/80">
        
        {/* Top Header */}
        <header className="sticky top-0 z-40 bg-[#1b4332] text-white px-4 py-3 flex items-center justify-between shadow-md">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-forest-800 border border-forest-500/50 flex items-center justify-center font-bold text-amber-300">
              ⛺
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight leading-tight">{title}</h1>
              <p className="text-xs text-forest-100/80 font-medium">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Link href="/admin/docs" className="text-forest-100/70 hover:text-white p-1 text-xs font-semibold bg-forest-800/80 px-2 py-1 rounded-md border border-forest-500/40">
              Admin SOP
            </Link>
            <div className="w-8 h-8 rounded-full bg-amber-400 text-forest-900 flex items-center justify-center font-bold text-xs ring-2 ring-white/20">
              JD
            </div>
          </div>
        </header>

        {/* Scrollable Viewport */}
        <main className="flex-1 pb-24 p-4 space-y-4">
          {children}
        </main>

        {/* Bottom Tab Navigation */}
        <nav className="fixed bottom-0 max-w-md w-full z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 px-3 py-2 flex items-center justify-around shadow-lg">
          <Link href="/feed" className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-semibold transition ${activeTab === 'feed' ? 'text-[#1b4332]' : 'text-stone-400 hover:text-stone-600'}`}>
            <Home className="w-5 h-5 mb-0.5" />
            <span>Feed</span>
          </Link>
          <Link href="/campouts/packing" className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-semibold transition ${activeTab === 'campouts' ? 'text-[#1b4332]' : 'text-stone-400 hover:text-stone-600'}`}>
            <Compass className="w-5 h-5 mb-0.5" />
            <span>Campouts</span>
          </Link>
          <Link href="/scoutbook" className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-semibold transition ${activeTab === 'scoutbook' ? 'text-[#1b4332]' : 'text-stone-400 hover:text-stone-600'}`}>
            <Award className="w-5 h-5 mb-0.5" />
            <span>Scoutbook</span>
          </Link>
          <Link href="/vault" className={`flex flex-col items-center py-1 px-3 rounded-lg text-xs font-semibold transition ${activeTab === 'vault' ? 'text-[#1b4332]' : 'text-stone-400 hover:text-stone-600'}`}>
            <Shield className="w-5 h-5 mb-0.5" />
            <span>Vault</span>
          </Link>
        </nav>

      </div>
    </div>
  );
};
```

---

# 4. SUPABASE DATABASE SCHEMA & RLS

**Use `supabase/migrations/20260929000000_init.sql`**. It replaces the schema that was here.
It is tested: `supabase/tests/01_rls_tests.sql` runs the permission checks listed below,
one per role (visitor, stranger, parent, other parent, den leader, admin), and they all pass.

Problems in the original schema that the migration fixes:
| Original problem | Fix |
|---|---|
| `profiles` SELECT policy queried `profiles` → Postgres "infinite recursion detected" on every read | Access checks moved into `SECURITY DEFINER` helpers (`is_member()`, `is_leader()`, `is_my_scout()` …) |
| Parents could `update profiles set role='admin', is_roster_verified=true` on their own row | Column grants: parents can only change `phone` and `preferred_name` |
| One email + one den per roster row | `families` → `adults` (many per family) → `scouts` (each with own den) |
| Any member could overwrite anyone's volunteer slot | Separate `volunteer_signups` rows; sign up / drop only yourself; capacity enforced |
| Photos defaulted to `approved` + `two_deep_verified` | Default `pending_review`; leaders approve; reviewer stamped server-side |
| `advancement_submissions` had RLS on but no policies (locked) | Family submits for own scouts; that den's leader (or committee) reviews |
| SMS OTP assumed | Email magic link only for now (SMS needs a paid Twilio/MessageBird account) |

### Tables at a glance
| Table | What it holds | Who can read | Who can write |
|---|---|---|---|
| `dens` | Lion…AOL dens | members | admin |
| `families`, `adults`, `scouts` | roster (from Scoutbook Plus export) | own family; leaders see all | admin / import |
| `den_leaders` | which adults lead which den | members | admin |
| `events`, `itinerary_items`, `packing_items` | calendar, campout schedule, packing lists | members | leaders |
| `announcements` | feed posts | members | leaders (own posts) |
| `volunteer_slots`, `volunteer_signups` | jobs + who took them | members | leaders / yourself |
| `photos` (+ bucket `pack-photos`) | YPT photo vault | approved + your own; leaders all | members upload, leaders approve |
| `advancement_submissions` | home requirements reported by parents | own scouts; den leaders | families submit, leaders review |
| `scout_advancement` | snapshot of Scoutbook Plus Quick Export | own scouts; den leaders | import only |

RPC: `leader_directory()` returns leaders' names/positions/contact info to members without exposing other parents.

### First-time setup
1. Create the Supabase project → SQL Editor → run the migration file.
2. Edit and run `supabase/seed.sql` (puts you in as admin, creates dens, fall events, packing list).
3. Authentication → Providers → Email: on. URL Configuration → Site URL = your app URL.
4. Load the roster (see `docs/DATA_EXPORTS.md`).

---

# 5. PWA CONFIGURATION (MANIFEST & OFFLINE SERVICE WORKER)

### `public/manifest.json`
```json
{
  "name": "Pack 361 Trailblazers Portal",
  "short_name": "Pack 361",
  "description": "Private member portal, campout checklists, offline trail map & Scoutbook hub for Pack 361",
  "start_url": "/feed",
  "display": "standalone",
  "background_color": "#faf9f4",
  "theme_color": "#1b4332",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

### Offline Service Worker Setup (via `next-pwa` in `next.config.js`)
```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: ({ url }) => /^\/campouts\/(packing|itinerary)/.test(url.pathname),
      handler: 'CacheFirst',
      options: {
        cacheName: 'pack-offline-campout-cache',
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days offline support
        }
      }
    }
  ]
});

module.exports = withPWA({
  reactStrictMode: true,
});
```

---

# 6. COMPLETE SCREEN-BY-SCREEN COMPONENT SPECIFICATIONS

Below is the production-ready React component code for each of your screens.

---

### 6.1 Roster Login & Private Portal Access (`pages/login.tsx`)
```tsx
import React, { useState } from 'react';
import Link from 'next/link';
import { Mail, Phone, Lock, ArrowRight, ShieldCheck, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function LoginPage() {
  const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentMessage, setSentMessage] = useState(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/feed` }
    });
    setLoading(false);
    if (error) alert("Error: " + error.message);
    else setSentMessage(true);
  };

  return (
    <div className="min-h-screen bg-[#faf9f4] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        
        {/* PWA Install Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3 shadow-sm">
          <div className="p-2 bg-amber-200/60 rounded-xl text-amber-800 text-lg">📲</div>
          <div className="flex-1">
            <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wide">Add Pack 361 to Your Home Screen</h3>
            <p className="text-xs text-amber-800 mt-0.5">Tap <strong>Share ⎋</strong> and select <strong>&quot;Add to Home Screen&quot;</strong> for instant offline access at campouts!</p>
            <Link href="/install-guide" className="inline-flex items-center text-xs font-bold text-[#1b4332] mt-2 underline">
              View 1-Tap Install Guide →
            </Link>
          </div>
        </div>

        {/* Portal Shield & Header */}
        <div className="bg-white rounded-3xl p-6 shadow-md border border-stone-200 text-center">
          <div className="w-16 h-16 bg-forest-50 border-2 border-forest-500 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl shadow-inner">
            🌲
          </div>
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-forest-50 border border-forest-100 text-[#1b4332] text-[11px] font-semibold tracking-wide uppercase mb-2">
            <Lock className="w-3 h-3 text-[#1b4332]" />
            <span>Restricted Access • BSA YPT Protected</span>
          </div>
          <h2 className="text-2xl font-black text-stone-900">Pack 361 Private Member Portal</h2>
          <p className="text-xs text-stone-600 mt-1 max-w-xs mx-auto">
            Official pack communications, roster verification, YPT photo vault, and advancement tracking for Pack 361 families.
          </p>

          {/* Switcher Pills */}
          <div className="flex rounded-xl bg-stone-100 p-1 mt-6 border border-stone-200">
            <button 
              onClick={() => setAuthMethod('email')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${authMethod === 'email' ? 'bg-white shadow text-[#1b4332]' : 'text-stone-500'}`}
            >
              Magic Link (Email)
            </button>
            <button 
              onClick={() => setAuthMethod('phone')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${authMethod === 'phone' ? 'bg-white shadow text-[#1b4332]' : 'text-stone-500'}`}
            >
              Phone SMS Code
            </button>
          </div>

          {/* Form */}
          {sentMessage ? (
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-left">
              <h4 className="text-sm font-bold text-emerald-800">Check Your Email Inbox!</h4>
              <p className="text-xs text-emerald-700 mt-1">We sent a secure 1-tap sign-in link to <strong>{email}</strong>.</p>
            </div>
          ) : (
            <form onSubmit={handleMagicLink} className="mt-4 space-y-3 text-left">
              <div>
                <div className="flex justify-between items-center text-xs font-semibold text-stone-700 mb-1">
                  <span>Registered Parent/Guardian Email</span>
                  <span className="text-emerald-700 flex items-center gap-1 text-[11px]">✓ Roster Match</span>
                </div>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-3 text-stone-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. parent@example.com"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1b4332]"
                  />
                </div>
                <p className="text-[11px] text-stone-500 mt-1">Must match your registration email currently on file with Scoutbook.</p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#1b4332] hover:bg-[#143527] text-white py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center space-x-2"
              >
                <span>{loading ? "Sending..." : "Send Secure Magic Sign-In Link"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Member Vault Feature Unlock Preview */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-200">
          <h4 className="text-xs font-bold uppercase text-stone-500 tracking-wider mb-2">Your Verified Roster Access Unlocks:</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 font-semibold flex items-center space-x-2">
              <span>🏕️</span>
              <span>Campout Map & Meals</span>
            </div>
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 font-semibold flex items-center space-x-2">
              <span>📸</span>
              <span>Safe YPT Photo Vault</span>
            </div>
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 font-semibold flex items-center space-x-2">
              <span>🏅</span>
              <span>Scoutbook Advancements</span>
            </div>
            <div className="p-2.5 bg-stone-50 rounded-xl border border-stone-200/70 font-semibold flex items-center space-x-2">
              <span>🏁</span>
              <span>Pinewood Derby Heats</span>
            </div>
          </div>
        </div>

        {/* Not on Roster Support Card */}
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-xs text-stone-600 flex items-start space-x-3">
          <HelpCircle className="w-5 h-5 text-stone-400 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-bold text-stone-900 block">New or Not on the Roster?</span>
            Need to update your contact email? Contact the Committee Chair or Advancement Chair to verify your membership.
          </div>
        </div>

      </div>
    </div>
  );
}
```

---

### 6.2 Pack Feed & Home Hub (`pages/feed.tsx`)
```tsx
import React from 'react';
import { AppShell } from '../components/AppShell';
import { AlertCircle, Calendar, Compass, Award, CheckCircle2, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function FeedPage() {
  return (
    <AppShell activeTab="feed" subtitle="Pack Feed & Activity Hub">
      
      {/* Campout Alert Callout */}
      <div className="bg-[#1b4332] text-white p-4 rounded-3xl shadow-md relative overflow-hidden">
        <div className="flex items-center space-x-2 text-amber-300 text-xs font-bold uppercase tracking-wider mb-1">
          <AlertCircle className="w-4 h-4" />
          <span>Next Major Unit Event</span>
        </div>
        <h2 className="text-lg font-black leading-tight">Fall Campout: Broad Creek</h2>
        <p className="text-xs text-forest-100/90 mt-1">Oct 23–25, 2026 • Whiteford, MD</p>
        
        <div className="flex gap-2 mt-3">
          <Link href="/campouts/packing" className="bg-amber-400 hover:bg-amber-300 text-stone-900 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center space-x-1 shadow">
            <span>Packing Checklist</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
          <Link href="/campouts/itinerary" className="bg-white/10 hover:bg-white/20 text-white font-semibold px-3 py-1.5 rounded-xl text-xs">
            Field Map & Schedule
          </Link>
        </div>
      </div>

      {/* Quick Action Navigation Grid */}
      <div className="grid grid-cols-4 gap-2">
        <Link href="/campouts/packing" className="bg-white p-2.5 rounded-2xl border border-stone-200 text-center flex flex-col items-center shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center text-lg mb-1">🎒</div>
          <span className="text-[11px] font-bold text-stone-700">Gear</span>
        </Link>
        <Link href="/volunteer" className="bg-white p-2.5 rounded-2xl border border-stone-200 text-center flex flex-col items-center shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center text-lg mb-1">🤝</div>
          <span className="text-[11px] font-bold text-stone-700">Volunteer</span>
        </Link>
        <Link href="/scoutbook" className="bg-white p-2.5 rounded-2xl border border-stone-200 text-center flex flex-col items-center shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-800 flex items-center justify-center text-lg mb-1">🏅</div>
          <span className="text-[11px] font-bold text-stone-700">Awards</span>
        </Link>
        <Link href="/den-hub" className="bg-white p-2.5 rounded-2xl border border-stone-200 text-center flex flex-col items-center shadow-sm">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center text-lg mb-1">🐺</div>
          <span className="text-[11px] font-bold text-stone-700">Den Hub</span>
        </Link>
      </div>

      {/* Announcements Stream */}
      <div className="space-y-3 pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Pack Announcements</h3>

        {/* Feed Card 1 */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="bg-forest-50 text-[#1b4332] font-bold px-2 py-0.5 rounded-md border border-forest-100">
              Pinewood Derby
            </span>
            <span className="text-stone-400">Yesterday • Cubmaster</span>
          </div>
          <h4 className="text-sm font-bold text-stone-900">Official Car Weigh-In Rules & Pit Practice</h4>
          <p className="text-xs text-stone-600 leading-relaxed">
            All Pinewood Derby cars must adhere to the 5.00 oz maximum weight limit and official wheel clearance. We will have graphite stations and balance scales setup this Saturday at [Derby venue]!
          </p>
          <div className="pt-2 border-t border-stone-100 flex justify-between items-center text-xs">
            <Link href="/pinewood-derby" className="text-[#1b4332] font-bold hover:underline">
              View Rules & Track Heats →
            </Link>
            <span className="text-stone-400 font-medium">12 Parent RSVPs</span>
          </div>
        </div>

        {/* Feed Card 2 */}
        <div className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="bg-amber-50 text-amber-800 font-bold px-2 py-0.5 rounded-md border border-amber-200">
              Service Project
            </span>
            <span className="text-stone-400">3 days ago • Committee Chair</span>
          </div>
          <h4 className="text-sm font-bold text-stone-900">Community Tree Planting Saplings Arriving</h4>
          <p className="text-xs text-stone-600 leading-relaxed">
            Thank you to all 18 cubs who helped plant 45 saplings at Centennial Park! Check out photos in the YPT Vault.
          </p>
        </div>
      </div>

    </AppShell>
  );
}
```

---

### 6.3 Campout Packing Checklist (`pages/campouts/packing.tsx`)
```tsx
import React, { useState, useEffect } from 'react';
import { AppShell } from '../../components/AppShell';
import { Check, ShieldAlert, Sparkles, DownloadCloud } from 'lucide-react';

interface CheckItem {
  id: string;
  category: 'essentials' | 'gear' | 'attire';
  label: string;
  subtitle?: string;
  mandatory?: boolean;
}

const CHECKLIST_ITEMS: CheckItem[] = [
  { id: '1', category: 'essentials', label: 'First Aid Kit (Band-aids, moleskin)', mandatory: true },
  { id: '2', category: 'essentials', label: 'Water Bottle (Filled 32oz)', mandatory: true },
  { id: '3', category: 'essentials', label: 'Flashlight or Headlamp (Fresh batteries)', mandatory: true },
  { id: '4', category: 'essentials', label: 'Trail Food / Wholesome Snacks', mandatory: true },
  { id: '5', category: 'essentials', label: 'Sunscreen & Insect Repellent (Non-aerosol)', mandatory: true },
  { id: '6', category: 'essentials', label: 'Safety Whistle (Pealess)', mandatory: true },
  { id: '7', category: 'gear', label: 'Tent & Ground Tarp (With stakes)', mandatory: true },
  { id: '8', category: 'gear', label: 'Sleeping Bag (Rated 40°F or lower)', mandatory: true },
  { id: '9', category: 'gear', label: 'Sleeping Pad or Cot', mandatory: false },
  { id: '10', category: 'gear', label: 'Camp Chair (Adult & Scout sized)', mandatory: false },
  { id: '11', category: 'attire', label: 'Field Uniform (For campfire ceremony)', mandatory: true },
  { id: '12', category: 'attire', label: 'Pack T-Shirt (Daytime hiking)', mandatory: true },
  { id: '13', category: 'attire', label: 'Rain Poncho or Waterproof Jacket', mandatory: true },
  { id: '14', category: 'attire', label: 'Extra Wool/Synthetic Socks (2 pairs)', mandatory: true }
];

export default function PackingPage() {
  const [checked, setChecked] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    const saved = localStorage.getItem('pack361_packing_list');
    if (saved) setChecked(JSON.parse(saved));
  }, []);

  const toggleItem = (id: string) => {
    const updated = { ...checked, [id]: !checked[id] };
    setChecked(updated);
    localStorage.setItem('pack361_packing_list', JSON.stringify(updated));
  };

  const progress = Math.round(
    (Object.values(checked).filter(Boolean).length / CHECKLIST_ITEMS.length) * 100
  );

  return (
    <AppShell activeTab="campouts" subtitle="Campout Gear Checklist">
      
      {/* Progress & Offline Callout */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-stone-900">Broad Creek Packing Readiness</h2>
            <p className="text-xs text-stone-500">Cub Scout 6 Essentials + Overnight Gear</p>
          </div>
          <span className="text-sm font-black text-[#1b4332] bg-forest-50 px-2.5 py-1 rounded-xl border border-forest-100">
            {progress}% Ready
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden">
          <div 
            className="bg-[#1b4332] h-full transition-all duration-300 rounded-full"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center text-[11px] text-stone-500 bg-stone-50 p-2 rounded-xl border border-stone-200/60">
          <DownloadCloud className="w-3.5 h-3.5 text-stone-400 mr-1.5" />
          <span>Offline Ready: Checked items sync locally with no cellular signal needed.</span>
        </div>
      </div>

      {/* Category: Cub Scout 6 Essentials */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
            <span>🛡️</span>
            <span>The Cub Scout 6 Essentials</span>
          </h3>
          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
            Mandatory
          </span>
        </div>

        {CHECKLIST_ITEMS.filter(i => i.category === 'essentials').map(item => (
          <div 
            key={item.id}
            onClick={() => toggleItem(item.id)}
            className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
              checked[item.id] ? 'bg-forest-50/60 border-forest-200 text-[#1b4332]' : 'bg-white border-stone-200 text-stone-800'
            }`}
          >
            <span className={`text-xs font-semibold ${checked[item.id] ? 'line-through text-stone-400' : ''}`}>
              {item.label}
            </span>
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center border ${
              checked[item.id] ? 'bg-[#1b4332] border-[#1b4332] text-white' : 'border-stone-300 bg-white'
            }`}>
              {checked[item.id] && <Check className="w-3.5 h-3.5" />}
            </div>
          </div>
        ))}
      </div>

      {/* Category: Sleep & Tent Shelter */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
          <span>⛺</span>
          <span>Tent & Camp Gear</span>
        </h3>
        {CHECKLIST_ITEMS.filter(i => i.category === 'gear').map(item => (
          <div 
            key={item.id}
            onClick={() => toggleItem(item.id)}
            className={`p-3 rounded-2xl border transition flex items-center justify-between cursor-pointer ${
              checked[item.id] ? 'bg-forest-50/60 border-forest-200 text-[#1b4332]' : 'bg-white border-stone-200 text-stone-800'
            }`}
          >
            <span className={`text-xs font-semibold ${checked[item.id] ? 'line-through text-stone-400' : ''}`}>
              {item.label}
            </span>
            <div className={`w-5 h-5 rounded-lg flex items-center justify-center border ${
              checked[item.id] ? 'bg-[#1b4332] border-[#1b4332] text-white' : 'border-stone-300 bg-white'
            }`}>
              {checked[item.id] && <Check className="w-3.5 h-3.5" />}
            </div>
          </div>
        ))}
      </div>

    </AppShell>
  );
}
```

---

### 6.4 Campout Itinerary & Field Map (`pages/campouts/itinerary.tsx`)
```tsx
import React from 'react';
import { AppShell } from '../../components/AppShell';
import { MapPin, Navigation, Clock, PhoneCall, AlertTriangle } from 'lucide-react';

export default function ItineraryPage() {
  return (
    <AppShell activeTab="campouts" subtitle="Campout Itinerary & Map">
      
      {/* Campsite & GPS Card */}
      <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-sm space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Site: Pack campsite
            </span>
            <h2 className="text-lg font-black text-stone-900 mt-1">Broad Creek (Sam Houston Council)</h2>
            <p className="text-xs text-stone-500">1929 Susquehanna Hall Rd, Whiteford, MD 21160</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-forest-50 text-[#1b4332] flex items-center justify-center text-xl">
            🗺️
          </div>
        </div>

        {/* Offline GPS Lat/Long */}
        <div className="bg-stone-50 p-2.5 rounded-xl border border-stone-200 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Navigation className="w-4 h-4 text-[#1b4332]" />
            <span className="font-mono text-stone-700">30.5739° N, 95.1482° W</span>
          </div>
          <span className="text-[11px] text-stone-400 font-semibold">Cached Offline</span>
        </div>
      </div>

      {/* Weekend Schedule */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Weekend Timeline</h3>

        <div className="bg-white rounded-2xl p-3.5 border border-stone-200 shadow-sm space-y-3">
          
          <div className="flex items-start space-x-3 text-xs">
            <span className="font-mono font-bold text-[#1b4332] bg-forest-50 px-2 py-1 rounded-md border border-forest-100 flex-shrink-0">
              FRI 5:30 PM
            </span>
            <div>
              <span className="font-bold text-stone-900 block">Campsite Check-in & Pitch Tents</span>
              <p className="text-stone-500 text-[11px]">Meet at the campsite flagpole. Setup tents before sundown.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 text-xs">
            <span className="font-mono font-bold text-[#1b4332] bg-forest-50 px-2 py-1 rounded-md border border-forest-100 flex-shrink-0">
              SAT 8:00 AM
            </span>
            <div>
              <span className="font-bold text-stone-900 block">Colors Ceremony & Chuckwagon Breakfast</span>
              <p className="text-stone-500 text-[11px]">Field Uniform uniform required for morning flag raising.</p>
            </div>
          </div>

          <div className="flex items-start space-x-3 text-xs">
            <span className="font-mono font-bold text-[#1b4332] bg-forest-50 px-2 py-1 rounded-md border border-forest-100 flex-shrink-0">
              SAT 7:30 PM
            </span>
            <div>
              <span className="font-bold text-stone-900 block">Pack Campfire & Skits</span>
              <p className="text-stone-500 text-[11px]">Stone Amphitheater fire ring. Bring camp chairs & s&apos;mores sticks!</p>
            </div>
          </div>

        </div>
      </div>

      {/* Emergency Camp Contacts */}
      <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 text-xs text-red-900 space-y-1.5">
        <div className="flex items-center space-x-1.5 font-bold">
          <AlertTriangle className="w-4 h-4 text-red-700" />
          <span>Camp Ranger / Emergency Lead</span>
        </div>
        <p className="text-[11px] text-red-800">
          Camp Ranger On-Call: (936) 555-0199 • BALOO Leader Rob MacIntyre: (555) 342-9901
        </p>
      </div>

    </AppShell>
  );
}
```

---

### 6.5 Scoutbook Advancements (`pages/scoutbook.tsx`)
```tsx
import React from 'react';
import { AppShell } from '../components/AppShell';
import { Award, CheckCircle, Clock, RefreshCw, FileText } from 'lucide-react';
import Link from 'next/link';

export default function ScoutbookPage() {
  return (
    <AppShell activeTab="scoutbook" subtitle="Official Advancements & Ranks">
      
      {/* Scout Rank Hero */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-2xl">
              🐺
            </div>
            <div>
              <h2 className="text-base font-black text-stone-900">Wolf Rank Advancement</h2>
              <p className="text-xs text-stone-500">Den 3 (2nd Grade) • Scout: Liam Tremont</p>
            </div>
          </div>
          <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-xl border border-amber-200">
            5 of 6 Done
          </span>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center justify-between text-[11px] bg-stone-50 p-2.5 rounded-xl border border-stone-200">
          <div className="flex items-center space-x-1.5 text-stone-600">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
            <span>Synced with Scoutbook CSV Export</span>
          </div>
          <span className="font-semibold text-stone-400">Jan 18, 2025</span>
        </div>
      </div>

      {/* Adventures List */}
      <div className="space-y-2 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Required Adventures</h3>
          <Link href="/den-hub" className="text-xs font-bold text-[#1b4332] hover:underline">
            + Submit At-Home Req
          </Link>
        </div>

        <div className="space-y-2">
          
          {/* Completed Adventure */}
          <div className="bg-white p-3.5 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <h4 className="text-xs font-bold text-stone-900">Call of the Wild</h4>
                <p className="text-[11px] text-stone-500">Campout outdoor essentials, knots & weather</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
              Approved
            </span>
          </div>

          {/* Completed Adventure */}
          <div className="bg-white p-3.5 rounded-2xl border border-stone-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
              <div>
                <h4 className="text-xs font-bold text-stone-900">Council Fire</h4>
                <p className="text-[11px] text-stone-500">Duty to country, community service & flag care</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md border border-emerald-200">
              Approved
            </span>
          </div>

          {/* In Progress Adventure */}
          <div className="bg-white p-3.5 rounded-2xl border border-amber-200 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-3">
              <Clock className="w-5 h-5 text-amber-500" />
              <div>
                <h4 className="text-xs font-bold text-stone-900">Paws on the Path</h4>
                <p className="text-[11px] text-stone-500">1-Mile hike & outdoor code sign-off pending</p>
              </div>
            </div>
            <span className="text-[10px] font-bold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">
              1 Req Left
            </span>
          </div>

        </div>
      </div>

    </AppShell>
  );
}
```

---

### 6.6 Den Meeting Hub & At-Home Catch-up (`pages/den-hub.tsx`)
```tsx
import React, { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Send, Upload, CheckSquare, Award } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

export default function DenHubPage() {
  const [adventure, setAdventure] = useState('Paws on the Path');
  const [requirement, setRequirement] = useState('Req 4: 1-Mile Nature Walk');
  const [notes, setNotes] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <AppShell activeTab="scoutbook" subtitle="Den Meeting & Catch-up">
      
      {/* Den Info Banner */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-forest-700 bg-forest-50 px-2.5 py-1 rounded-xl border border-forest-100">
            Wolf Den 3 • 2nd Grade
          </span>
          <span className="text-xs text-stone-400">Leader: Mark Thompson</span>
        </div>
        <h2 className="text-base font-black text-stone-900">Missed a Den Meeting? Catch Up Here!</h2>
        <p className="text-xs text-stone-600">
          Complete remaining adventure steps at home with your scout and submit details directly to your Den Leader & the Advancement Chair.
        </p>
      </div>

      {/* Submission Form */}
      <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-4">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Submit At-Home Signoff</h3>

        {submitted ? (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-800 space-y-1">
            <span className="font-bold block text-sm">Submission Sent to Leader Mark!</span>
            <p>Once verified, this requirement will be recorded in Scoutbook for the next Pack Blue & Gold Court of Honor.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-stone-700 block mb-1">Adventure Loop</label>
              <select 
                value={adventure}
                onChange={e => setAdventure(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-200 font-medium bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[#1b4332]"
              >
                <option>Paws on the Path (Hiking)</option>
                <option>Running with the Pack (Fitness)</option>
                <option>Howling at the Moon (Skit & Song)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1">Requirement Number</label>
              <input 
                type="text"
                value={requirement}
                onChange={e => setRequirement(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-stone-200 font-medium bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[#1b4332]"
              />
            </div>

            <div>
              <label className="font-bold text-stone-700 block mb-1">Completion Notes / What Scout Did</label>
              <textarea 
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Liam and I completed a 1.2 mile walk at Centennial Park trail. Pointed out 3 native Texas trees..."
                className="w-full p-2.5 rounded-xl border border-stone-200 font-medium bg-stone-50 focus:outline-none focus:ring-2 focus:ring-[#1b4332]"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#1b4332] text-white py-3 rounded-xl font-bold text-xs shadow-md transition flex items-center justify-center space-x-1.5"
            >
              <span>Submit to Den Leader for Signoff</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        )}
      </div>

    </AppShell>
  );
}
```

---

### 6.7 Volunteer Signup & Committee Roster (`pages/volunteer.tsx`)
```tsx
import React, { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Users, Clock, Check, Heart, Shield } from 'lucide-react';

interface Slot {
  id: string;
  event: string;
  role: string;
  time: string;
  filled: boolean;
  urgent?: boolean;
}

const SLOTS: Slot[] = [
  { id: '1', event: 'Pinewood Derby', role: 'Pit Graphite & Tuning Lead', time: 'Jan 25 • 9:00 AM (2 hrs)', filled: false, urgent: true },
  { id: '2', event: 'Pinewood Derby', role: 'Weigh-in Scale Checker', time: 'Jan 25 • 8:30 AM (1.5 hrs)', filled: true },
  { id: '3', event: 'Spring Campout', role: 'BALOO Chuckwagon Prep', time: 'March 22 • 4:00 PM (2 hrs)', filled: false, urgent: true },
  { id: '4', event: 'Pack Meeting', role: 'Flag Ceremony Greeter', time: 'Every 2nd Tuesday (20 min)', filled: false }
];

export default function VolunteerPage() {
  const [claimed, setClaimed] = useState<{ [key: string]: boolean }>({});

  const claim = (id: string) => {
    setClaimed({ ...claimed, [id]: true });
  };

  return (
    <AppShell activeTab="feed" subtitle="Volunteer Corps">
      
      {/* Volunteer Pulse Banner */}
      <div className="bg-[#1b4332] text-white p-5 rounded-3xl shadow-md space-y-3">
        <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider">Scouting is 100% Volunteer Powered</span>
        <h2 className="text-lg font-black leading-tight">&quot;Do Your Best — Every Scout Deserves a Trained Leader&quot;</h2>
        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="bg-forest-800 p-2 rounded-xl border border-forest-500/40">
            <span className="text-base font-black text-white block">24</span>
            <span className="text-[10px] text-forest-100 font-semibold">Active Parents</span>
          </div>
          <div className="bg-forest-800 p-2 rounded-xl border border-forest-500/40">
            <span className="text-base font-black text-amber-300 block">5</span>
            <span className="text-[10px] text-forest-100 font-semibold">Urgent Gigs</span>
          </div>
          <div className="bg-forest-800 p-2 rounded-xl border border-forest-500/40">
            <span className="text-base font-black text-emerald-300 block">100%</span>
            <span className="text-[10px] text-forest-100 font-semibold">YPT Certified</span>
          </div>
        </div>
      </div>

      {/* Urgent Help Needed */}
      <div className="space-y-2 pt-2">
        <h3 className="text-xs font-black uppercase tracking-wider text-stone-500">Urgent Open Shifts</h3>

        {SLOTS.map(slot => (
          <div key={slot.id} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-bold text-stone-900">{slot.role}</span>
                {slot.urgent && (
                  <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                    Needed
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500">{slot.event} • {slot.time}</p>
            </div>

            {slot.filled || claimed[slot.id] ? (
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                Filled ✓
              </span>
            ) : (
              <button 
                onClick={() => claim(slot.id)}
                className="bg-[#1b4332] text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-[#143527] shadow"
              >
                Sign Up
              </button>
            )}
          </div>
        ))}
      </div>

      {/* YPT Training Requirement Callout */}
      <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200 text-xs text-stone-600 flex items-start space-x-2.5">
        <Shield className="w-4 h-4 text-forest-700 mt-0.5 flex-shrink-0" />
        <div>
          <span className="font-bold text-stone-900 block">BSA Youth Protection Mandatory</span>
          All adult volunteers must complete the free 30-minute online YPT course at <strong>my.scouting.org</strong> prior to working with youth.
        </div>
      </div>

    </AppShell>
  );
}
```

---

### 6.8 YPT-Compliant Photo Vault (`pages/vault.tsx`)
```tsx
import React, { useState } from 'react';
import { AppShell } from '../components/AppShell';
import { ShieldCheck, Camera, Filter, EyeOff } from 'lucide-react';

const PHOTOS = [
  { id: '1', title: 'Tree Planting Service Day', tag: 'Service Project', url: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=600&auto=format&fit=crop&q=80' },
  { id: '2', title: 'Stone Fire Ring Campfire', tag: 'Spring Campout', url: 'https://images.unsplash.com/photo-1478131143081-80f7f84ca84d?w=600&auto=format&fit=crop&q=80' },
  { id: '3', title: 'Pinewood Derby Finish Line', tag: 'Derby 2025', url: 'https://images.unsplash.com/photo-1530549387789-4c1017266635?w=600&auto=format&fit=crop&q=80' }
];

export default function VaultPage() {
  const [filter, setFilter] = useState('All');

  return (
    <AppShell activeTab="vault" subtitle="YPT Safe Photo Vault">
      
      {/* Privacy Notice Banner */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-sm space-y-2">
        <div className="flex items-center space-x-2 text-forest-700 text-xs font-bold uppercase tracking-wider">
          <ShieldCheck className="w-4 h-4" />
          <span>Scouting America Youth Privacy Standard</span>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          Photos are hosted in private, non-indexable storage restricted strictly to registered Pack 361 parents. Never publish scouts&apos; full names or geo-tagged location coordinates publicly.
        </p>
      </div>

      {/* Gallery Action Bar */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex space-x-1.5 overflow-x-auto text-xs font-bold">
          {['All', 'Campouts', 'Pinewood', 'Service'].map(t => (
            <button 
              key={t}
              onClick={() => setFilter(t)}
              className={`px-3 py-1.5 rounded-xl border transition ${filter === t ? 'bg-[#1b4332] text-white border-[#1b4332]' : 'bg-white text-stone-600 border-stone-200'}`}
            >
              {t}
            </button>
          ))}
        </div>

        <button className="bg-forest-50 border border-forest-200 text-[#1b4332] font-bold text-xs px-3 py-1.5 rounded-xl flex items-center space-x-1">
          <Camera className="w-3.5 h-3.5" />
          <span>Upload</span>
        </button>
      </div>

      {/* Photo Grid */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        {PHOTOS.map(photo => (
          <div key={photo.id} className="bg-white rounded-2xl overflow-hidden border border-stone-200 shadow-sm">
            <div className="h-32 bg-stone-200 relative overflow-hidden">
              <img src={photo.url} alt={photo.title} className="w-full h-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 bg-black/60 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
                {photo.tag}
              </span>
            </div>
            <div className="p-2.5">
              <h4 className="text-xs font-bold text-stone-900 truncate">{photo.title}</h4>
              <p className="text-[10px] text-stone-400 mt-0.5">Approved by YPT Admin</p>
            </div>
          </div>
        ))}
      </div>

    </AppShell>
  );
}
```

---

### 6.9 Pack Leadership Directory & Contacts (`pages/leaders.tsx`)
```tsx
import React, { useEffect, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { Phone, Mail, ShieldAlert } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

type Leader = { adult_id: string; name: string; position_title: string | null; role: string;
                email: string; phone: string | null; dens: string | null };

export default function LeadersPage() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  useEffect(() => { supabase.rpc('leader_directory').then(({ data }) => setLeaders(data ?? [])); }, []);
  return (
    <AppShell activeTab="feed" subtitle="Leadership Contacts">
      
      <div className="space-y-3">
        <h2 className="text-xs font-black uppercase tracking-wider text-stone-500">Pack 361 Leadership Team</h2>

        {leaders.map((leader, i) => (
          <div key={i} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs font-black text-stone-900 block">{leader.name}</span>
              <span className="text-xs font-bold text-[#1b4332] block">{leader.position_title ?? leader.role}</span>
              <span className="text-[11px] text-stone-400">{leader.dens}</span>
            </div>

            <div className="flex space-x-2">
              <a 
                href={`tel:${leader.phone}`}
                className="w-9 h-9 rounded-xl bg-forest-50 text-[#1b4332] border border-forest-100 flex items-center justify-center hover:bg-forest-100"
              >
                <Phone className="w-4 h-4" />
              </a>
              <a 
                href={`mailto:${leader.email}`}
                className="w-9 h-9 rounded-xl bg-forest-50 text-[#1b4332] border border-forest-100 flex items-center justify-center hover:bg-forest-100"
              >
                <Mail className="w-4 h-4" />
              </a>
            </div>
          </div>
        ))}

        {/* BSA 24/7 Helpline */}
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start space-x-3">
          <ShieldAlert className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold block">Scouting America 24/7 Safety Helpline</span>
            Immediate assistance for any incident or Youth Protection question: <strong>1-844-SCOUTS1 (1-844-726-8871)</strong>
          </div>
        </div>
      </div>

    </AppShell>
  );
}
```

---

### 6.10 Leader Docs & Scoutbook SOP (`pages/admin/docs.tsx`)
```tsx
import React from 'react';
import { AppShell } from '../../components/AppShell';
import { Download, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AdminDocsPage() {
  return (
    <AppShell activeTab="feed" subtitle="Admin SOP & Scoutbook Sync">
      
      <div className="space-y-4">
        
        {/* Instructions Card */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-forest-700 text-xs font-bold uppercase tracking-wider">
            <FileText className="w-4 h-4" />
            <span>Administrator Sync SOP</span>
          </div>
          <h2 className="text-base font-black text-stone-900">How to Export & Sync Scoutbook Roster</h2>
          
          <ol className="text-xs text-stone-600 space-y-2 list-decimal list-inside leading-relaxed">
            <li>Log into <strong>scoutbook.scouting.org</strong> with your BSA credentials.</li>
            <li>Navigate to <strong>Pack 361 → Unit Reports → Export Roster (CSV)</strong>.</li>
            <li>Open the Supabase Dashboard → <code>roster_whitelist</code> table.</li>
            <li>Click <strong>Insert → Import data from CSV</strong> and upload the exported file.</li>
            <li>All newly registered parents will be automatically verified on first login!</li>
          </ol>
        </div>

        {/* Advancement Audit Checklist */}
        <div className="bg-forest-50 p-4 rounded-2xl border border-forest-100 text-xs text-forest-900 space-y-2">
          <h3 className="font-bold flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-[#1b4332]" />
            <span>Advancement Chair Monthly Audit</span>
          </h3>
          <p className="text-[11px] leading-relaxed">
            Advancement records are synced every 2nd Tuesday prior to Pack Meetings to prepare belt loops and badges for Court of Honor presentations. Contact the Advancement Chair for discrepancies.
          </p>
        </div>

      </div>

    </AppShell>
  );
}
```

---

### 6.11 Add to Home Screen PWA Install Guide (`pages/install-guide.tsx`)
```tsx
import React from 'react';
import { AppShell } from '../components/AppShell';
import { Share, PlusSquare, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function InstallGuidePage() {
  return (
    <AppShell activeTab="feed" subtitle="PWA Install Guide">
      
      <div className="space-y-4">
        <Link href="/feed" className="inline-flex items-center text-xs font-bold text-[#1b4332]">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          <span>Back to Feed</span>
        </Link>

        {/* iOS Safari Steps */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-stone-900 text-sm font-black">
            <span>🍎</span>
            <span>iPhone & iPad (Safari)</span>
          </div>

          <div className="space-y-2 text-xs text-stone-600">
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
              <span>Open the portal in <strong>Safari</strong> on your iPhone.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
              <span>Tap the <strong>Share</strong> button (the square with an arrow pointing up at the bottom).</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
              <span>Scroll down and select <strong>&quot;Add to Home Screen&quot;</strong>.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">4</span>
              <span>Tap <strong>Add</strong> in the top right corner. The Pack 361 app icon will now appear on your home screen!</span>
            </div>
          </div>
        </div>

        {/* Android Chrome Steps */}
        <div className="bg-white p-5 rounded-3xl border border-stone-200 shadow-sm space-y-3">
          <div className="flex items-center space-x-2 text-stone-900 text-sm font-black">
            <span>🤖</span>
            <span>Android (Chrome)</span>
          </div>

          <div className="space-y-2 text-xs text-stone-600">
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">1</span>
              <span>Open the portal in <strong>Google Chrome</strong>.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">2</span>
              <span>Tap the <strong>three dots menu (⋮)</strong> in the top right corner.</span>
            </div>
            <div className="flex items-start space-x-2.5">
              <span className="w-5 h-5 rounded-full bg-forest-50 text-[#1b4332] font-bold flex items-center justify-center flex-shrink-0 text-[11px]">3</span>
              <span>Select <strong>&quot;Install app&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</span>
            </div>
          </div>
        </div>

      </div>

    </AppShell>
  );
}
```

---

# 7. AUTHENTICATION & AUTHORIZATION HOOKS (REACT / TYPESCRIPT)

### `lib/supabaseClient.ts`
```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### `hooks/usePackMember.ts`
```typescript
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';

export type AppRole = 'parent' | 'den_leader' | 'committee' | 'cubmaster' | 'admin';
export interface Adult {
  id: string; family_id: string | null; first_name: string; last_name: string;
  preferred_name: string | null; email: string; phone: string | null;
  role: AppRole; position_title: string | null;
}

const PUBLIC_ROUTES = ['/login', '/install-guide', '/not-on-roster'];

export function usePackMember() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [adult, setAdult] = useState<Adult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) {
        setLoading(false);
        if (!PUBLIC_ROUTES.includes(router.pathname)) router.replace('/login');
        return;
      }
      // Roster row linked to this login (set by the on_auth_user_created trigger)
      const { data } = await supabase.from('adults').select('*').eq('user_id', user.id).maybeSingle();
      setAdult(data as Adult | null);
      setLoading(false);
      if (!data && !PUBLIC_ROUTES.includes(router.pathname)) router.replace('/not-on-roster');
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const isLeader = !!adult && adult.role !== 'parent';
  return { user, adult, loading, isMember: !!adult, isLeader };
}
```
Signed-in users with no roster match get `adult = null`. The database already returns
nothing to them, so the redirect is only for a friendly "ask the Committee Chair" screen.
