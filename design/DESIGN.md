---
name: Trailhead Scout
colors:
  surface: '#faf9f4'
  surface-dim: '#dbdad5'
  surface-bright: '#faf9f4'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ef'
  surface-container: '#efeee9'
  surface-container-high: '#e9e8e3'
  surface-container-highest: '#e3e3de'
  on-surface: '#1b1c19'
  on-surface-variant: '#414844'
  inverse-surface: '#30312e'
  inverse-on-surface: '#f2f1ec'
  outline: '#717973'
  outline-variant: '#c1c8c2'
  surface-tint: '#3f6653'
  primary: '#012d1d'
  on-primary: '#ffffff'
  primary-container: '#1b4332'
  on-primary-container: '#86af99'
  inverse-primary: '#a5d0b9'
  secondary: '#7e5700'
  on-secondary: '#ffffff'
  secondary-container: '#feba38'
  on-secondary-container: '#6e4c00'
  tertiary: '#1b2638'
  on-tertiary: '#ffffff'
  tertiary-container: '#313c4f'
  on-tertiary-container: '#9ba6bd'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c1ecd4'
  primary-fixed-dim: '#a5d0b9'
  on-primary-fixed: '#002114'
  on-primary-fixed-variant: '#274e3d'
  secondary-fixed: '#ffdeab'
  secondary-fixed-dim: '#feba38'
  on-secondary-fixed: '#281900'
  on-secondary-fixed-variant: '#5f4100'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#faf9f4'
  on-background: '#1b1c19'
  surface-variant: '#e3e3de'
typography:
  display-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '800'
    lineHeight: 44px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '700'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-badge:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '800'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system embodies the spirit of discovery, camaraderie, and wholesome adventure intrinsic to Cub Scouts. Designed for both young scouts tracking achievements and busy parents coordinating den activities, the aesthetic balances reassuring dependability with approachable, spirited warmth.

The design movement combines **Modern Tactile Warmth** with **Clean Editorial Utility**. It rejects sterile corporate minimalism in favor of tangible outdoor nostalgia: sturdy card surfaces evoking canvas and paper trail maps, soft debossed milestone indicators, and tactile embroidered patch metaphors. Visual cues evoke national parks, forest pines, campfire warmth, and trail markers—delivering an interface that feels ready for field trips, rain, and backyard campouts without ever feeling childish or chaotic.

## Colors

The palette grounds the interface in nature while preserving high contrast and outdoor legibility in bright sunlight:

- **Primary (`#1B4332` - Scout Forest Green):** The core anchor. Evokes deep pine needles, outdoor gear, and institutional authority. Used for primary navigation bars, active tabs, major CTA buttons, and key headlines.
- **Secondary (`#FEBA38` - Campfire Amber Gold):** The celebratory accent. Expresses warmth, campfires, ranks, merit, and completion. Used for active progress highlights, star awards, milestone pins, and attention-drawing interactive prompts.
- **Tertiary (`#1E293B` - Scout Night Navy):** Grounding dark hue. Used for high-contrast primary typography, secondary action buttons, parent permission toggles, and solid borders on tactile chips.
- **Neutral Accent (`#658A72` - Fresh Meadow Sage):** Secondary environmental tone used for soft fills, badge categories, completed sub-tasks, and sub-card headers.
- **Neutral Background (`#F9F8F3` - Natural Canvas Cream):** Replaces harsh stark whites with an organic, warm off-white canvas paper tone that reduces glare outdoors.
- **Surface Elevation (`#FFFFFF` - Pure Card White):** Clean elevated layer for content blocks, activity cards, and list groups against the cream base.

## Typography

The typography system relies on **Plus Jakarta Sans** across all roles to ensure geometric warmth, high readability, and approachable rounded terminals. 

- **Display & Headlines:** Use bold (`700` and `800`) weights with slight negative tracking to give scout rank titles, pack announcements, and adventure headers a proud, grounded emblem aesthetic.
- **Body:** Open counters and balanced x-height guarantee effortless scanning for both young readers and adults reviewing sign-offs outdoors.
- **Labels & Micro-copy:** Uppercase transformations are reserved specifically for `label-badge` roles (e.g., "COMPLETED", "REQUIRED", "LION", "TIGER", "BEAR", "WEBELOS") paired with wide letter-spacing (`0.05em`) mimicking embroidered uniform insignias.

## Layout & Spacing

The layout utilizes a structured fluid grid optimized primarily for handheld mobile screens, scaling fluidly into tablet formats for den leaders:

- **Mobile Canvas:** Single-column stacked layout with 16px (`1rem`) outer margins to maximize tap-target breadth while preventing thumb crowding.
- **Tablet / Expanded Canvas:** Max-width constrained container at 768px (for den sign-off views) with 24px (`1.5rem`) margins and 16px gutters arranged in 4-column cards.
- **Rhythm:** Spacing follows a 4px/8px modular scale. Spacing token `space-sm` (8px) separates interconnected sub-tasks, `space-md` (16px) establishes standard card interior padding, and `space-xl` (32px) separates distinct adventure categories or event groupings.

## Elevation & Depth

Visual hierarchy uses **Tonal Layering with Warm Amber-Tinted Shadows** to mirror natural daylight and physical scouting patches:

- **Surface Layer 0 (Base Canvas):** Warm Canvas Cream (`#F9F8F3`), flat with no shadow.
- **Surface Layer 1 (Standard Card & Module):** Pure Card White (`#FFFFFF`) with a delicate warm ambient shadow: `box-shadow: 0 2px 6px -1px rgba(30, 41, 58, 0.06), 0 1px 3px rgba(27, 67, 50, 0.04)`.
- **Surface Layer 2 (Floating Action & Modals):** White with an elevated physical drop shadow: `box-shadow: 0 10px 20px -3px rgba(27, 67, 50, 0.12), 0 4px 6px -2px rgba(233, 168, 37, 0.08)`.
- **Tactile Stamp / Emboss (Advancement Trackers):** Inset shading (`box-shadow: inset 0 2px 4px rgba(27, 67, 50, 0.08)`) combined with a faint 1px border (`#E5E7EB`) to give unearned badge slots an authentic empty-patch-loop appearance.

## Shapes

The design system employs **Level 2 (Rounded)** shape geometry (`roundedness: 2`). Standard containers carry an 8px (`0.5rem`) radius, while cards, interactive panels, and status chips step up to 16px (`1rem`). 

Badges, adventure belt-loop cards, and progress stamps use either full pill contours or subtle rounded hexagon/canteen contours to reinforce the tactile nature of physical Scouting America gear.

## Components

### Buttons
- **Primary Action (Trailhead Button):** Background `#1B4332`, text `#FFFFFF`, rounded 12px, font `label-lg`. Pressed state applies a tactile downward nudge (`transform: translateY(1px)`) and a darker pine shade (`#132E22`).
- **Secondary Action (Campfire Gold):** Background `#FEBA38`, text `#1E293B`, bold weight. Used for key progress triggers (e.g., "Sign Off Requirement", "Award Badge").
- **Ghost/Tertiary:** Pure white with a 1.5px border of `#1B4332`, text `#1B4332`.

### Chips & Badges
- **Status Badges:** Small pill capsules with `label-badge` typography in full uppercase.
  - *Completed:* `#E8F3EC` fill, `#1B4332` text, with a small pine checkmark icon.
  - *In Progress:* `#FEF6E7` fill, `#B45309` text, campfire sunburst dot.
  - *Leader Approval Required:* `#EFF6FF` fill, `#1E293B` text.
- **Adventure Belt-Loop Chip:** Semi-pill rounded rectangle featuring an icon container on the left, rank title, and percentage bar along the bottom edge.

### Checklist Items (Adventure Tracker)
- **Container:** Pure white card with 12px border radius, 12px padding, and 1px border (`#EAE7DC`).
- **Checkboxes:** Custom 22px rounded squares (6px border radius) styled with a 2px stroke in `#1B4332`. When checked, smooth fill transition to `#1B4332` containing a crisp `#FFFFFF` checkmark, striking through the title and shifting body text to `#658A72`.

### Input Fields
- Off-white interior fill (`#F9F8F3`) nested within cards.
- 1.5px border (`#D1D5DB`), transitioning to a solid `#1B4332` border with a 3px soft focus ring (`rgba(27, 67, 50, 0.15)`) on active focus.
- Floating label using `label-md` in `#1E293B`.

### Cards & Modules
- **Pack Announcement Card:** Canvas white card topped with a 4px Scout Forest Green accent header strip and subtle compass rose or tent watermark motif in the upper-right corner.
- **Rank Milestone Card:** Multi-tiered card pairing an amber progress bar, scout rank crest slot, and clear "X of Y Adventures Complete" metadata counter.