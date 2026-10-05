// "Navigate" links: open the phone's map app with directions to an event.

/** Where to navigate to: the street address, else the place name (not for online meetings). */
export function navDestination(e: { address?: string | null; location_name?: string | null }): string | null {
  const address = e.address?.trim();
  if (address) return address;
  const place = e.location_name?.trim();
  if (!place || /\b(online|zoom|virtual|google meet|teams|webex|tbd|tba|to be (announced|determined))\b|https?:\/\//i.test(place)) return null;
  return place;
}

/** Google Maps directions: opens the Google Maps app on Android (and on iPhone when it's installed). */
export function googleDirections(dest: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

/** Apple Maps directions (iPhone and iPad). */
export function appleDirections(dest: string): string {
  return `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
}
