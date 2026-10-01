// Photos for the public join page, from the pack's previous website (already approved for public
// use). Files live in /public/join, re-saved without camera metadata (no GPS). Keep public photos
// free of names and anything else that identifies a scout.
type Photo = { src: string; alt: string; width: number; height: number };

/** Thin banner under the top bar (hikers and the pack logo). */
export const HEADER: Photo | null = {
  src: "/join/banner.jpg",
  alt: "Pack 361, Ellicott City, MD",
  width: 1920,
  height: 200,
};

/** Big picture at the top of the welcome card. */
export const BANNER: Photo | null = {
  src: "/join/jumping-banner.jpg",
  alt: "Cub Scouts jumping for joy at a pack campout, with the Pack 361 logo",
  width: 1080,
  height: 380,
};

/** "Adventure starts right here" photo strip. */
export const STRIP: Photo | null = {
  src: "/join/adventure-strip.jpg",
  alt: "Adventure starts right here: scouts on a hike overlook, launching rockets and having fun",
  width: 720,
  height: 168,
};

export const PHOTOS: Photo[] = [
  { src: "/join/pack-group.jpg", alt: "Two Cub Scouts setting up a rocket on its launch pad", width: 800, height: 533 },
  { src: "/join/horses.jpg", alt: "Lion Scouts meeting a horse on a den outing", width: 290, height: 260 },
];
