// Word lists for the council events picker (/events/council). The council calendar has about
// 340 events a year; these lists decide which ones the picker hides by default and which get
// the "Cub Scouts" badge. Pure: safe on the server and in the browser. Matching ignores case
// and only matches whole words or phrases ("Bear" does not match "Bearings").

/** Committee meetings, holidays and office closings: hidden unless "Hide meetings & holidays" is off. */
export const MEETING_HOLIDAY_WORDS = [
  // Council business
  "Committee Meeting",
  "Commissioner",
  "Commissioners",
  "Cabinet",
  "Executive Board",
  "Board Meeting",
  "Board of Directors",
  "Key 3",
  "Key Three",
  "Annual Meeting",
  "Staff Meeting",
  "Membership Committee",
  // Office closings
  "Office Closed",
  "Offices Closed",
  "Service Center Closed",
  "Scout Shop Closed",
  "Closed",
  // Holidays
  "New Year's Day",
  "New Years Day",
  "Martin Luther King",
  "MLK Day",
  "Presidents Day",
  "Presidents' Day",
  "President's Day",
  "Good Friday",
  "Memorial Day",
  "Juneteenth",
  "Independence Day",
  "Fourth of July",
  "4th of July",
  "Labor Day",
  "Columbus Day",
  "Indigenous Peoples Day",
  "Indigenous Peoples' Day",
  "Veterans Day",
  "Thanksgiving",
  "Christmas Day",
  "Christmas Eve",
  "New Year's Eve",
  // Jewish holidays (the council marks them "Tier 1" / "Tier 2" for scheduling)
  "Tier",
  "Rosh Hashanah",
  "Yom Kippur",
  "Sukkot",
  "Shemini Atzeret",
  "Simchat Torah",
  "Passover",
  "Shavuot",
  "Hanukkah",
  "Chanukah",
  "Purim",
  // Other religious holidays the council lists
  "Ramadan",
  "Eid",
  "Diwali",
];

/** Other Baltimore Area Council districts. An event whose title names one of these is theirs. */
export const OTHER_DISTRICTS = [
  "Arrowhead",
  "Carroll",
  "Fort McHenry",
  "Ft. McHenry",
  "Ft McHenry",
  "Gunpowder Falls",
  "Harford",
  "River Hawk",
  "Riverhawk",
];

/** Our district (Howard County). Named in a title, it beats another district's name. */
export const OUR_DISTRICT = ["National Pike"];

/** Cub Scout events: get the "Cub Scouts" badge. */
export const CUB_WORDS = [
  "Cub",
  "Cubs",
  "Cub Scout",
  "Cub Scouts",
  "Cub Family Weekend",
  "Webelos",
  "Webelos Woods",
  "Weboree",
  "Lion",
  "Lions",
  "Tiger",
  "Tigers",
  "Wolf",
  "Wolves",
  "Bear",
  "Bears",
  "Arrow of Light",
  "AOL",
  "Pinewood",
  "Family",
  "Families",
  "BALOO",
  "IOLS",
  "Roundtable",
  "Spook-O-Ree",
  "Spookoree",
  "Day Camp",
  "Twilight",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Whole words: no letter or digit right before or after. Spaces in a phrase match any run of
// spaces or dashes ("Spook-O-Ree" / "Spook O Ree").
const toRegex = (words: string[]) =>
  new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map((w) => escape(w).replace(/[\s-]+/g, "[\\s-]+")).join("|")})(?![\\p{L}\\p{N}])`, "iu");

const MEETING_RE = toRegex(MEETING_HOLIDAY_WORDS);
const OUR_RE = toRegex(OUR_DISTRICT);
const CUB_RE = toRegex(CUB_WORDS);
const DISTRICT_RES = OTHER_DISTRICTS.map((d) => ({ name: d, re: toRegex([d]) }));

/** A committee meeting, holiday or office closing. */
export function isMeetingOrHoliday(title: string, categories?: string | null): boolean {
  return MEETING_RE.test(title) || Boolean(categories && /\bholiday/i.test(categories));
}

/** The other district an event belongs to (by its title), or null for ours and council-wide ones. */
export function otherDistrict(title: string): string | null {
  if (OUR_RE.test(title)) return null;
  return DISTRICT_RES.find((d) => d.re.test(title))?.name ?? null;
}

/** For Cub Scouts or their families (by title or the feed's categories). */
export function isCubEvent(title: string, categories?: string | null): boolean {
  return CUB_RE.test(title) || Boolean(categories && CUB_RE.test(categories));
}

export interface CouncilFilter {
  /** Hide committee meetings, holidays and office closings. */
  hideMeetings: boolean;
  /** Only our district and council-wide events. */
  ourDistrict: boolean;
  /** Words to look for in the title, place or description. */
  q?: string;
}

/** Does an undecided event pass the picker's filters? */
export function passesFilter(e: { title: string; location?: string | null; description?: string | null; categories?: string | null }, f: CouncilFilter): boolean {
  if (f.hideMeetings && isMeetingOrHoliday(e.title, e.categories)) return false;
  if (f.ourDistrict && otherDistrict(e.title)) return false;
  const q = f.q?.trim().toLowerCase();
  if (q) {
    const hay = [e.title, e.location, e.description, e.categories].filter(Boolean).join(" ").toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}

/** A starting category for the pack event, from the council event's title. */
export function guessCategory(title: string): string {
  if (/roundtable|training|\bIOLS\b|\bBALOO\b|\bYPT\b|university of scouting|pow ?wow/i.test(title)) return "Leaders";
  if (/national pike|district/i.test(title)) return "District";
  return "Council";
}
