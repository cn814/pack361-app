// The pack's Trail's End popcorn sale (Pack store → Popcorn fundraiser). Update these each fall:
// the unit code, the money split and who to contact come from the fundraising chairs.

export const POPCORN = {
  unitCode: "VA8EB",
  contact: { names: "Fundraising co-chair Cindy and Popcorn Kernel Andrew", email: "cindy72577@gmail.com" },
  androidUrl: "https://play.google.com/store/apps/details?id=com.trailsend.scout",
  appleUrl: "https://apps.apple.com/us/app/trails-end/id1421483087",
  gettingStartedUrl: "https://support.trails-end.com/en/articles/13465695-account-setup-getting-started-with-a-scout-account",
  rewardsUrl: "https://support.trails-end.com/en/articles/13432471-how-trail-s-end-rewards-work",
  /** Per bag, using a $20 bag as the example. */
  perBag: {
    price: "$20.00",
    toCouncil: "$13.00 – $15.00",
    productCost: "$5.00 – $5.40",
    packCommission: "$5.00 – $7.00",
    scoutShare: "$1.00 – $1.40",
    packShare: "$4.00 – $5.60",
  },
  scoutPercent: 20,
};

export const POPCORN_STEPS: { title: string; body: string }[] = [
  { title: "Download the Trail's End app", body: "Links for both phone types are below." },
  { title: `Register your Scout with unit code ${POPCORN.unitCode}`, body: "Register each Scout separately so their sales credit to their own account." },
  { title: "Set up the online store and share the link", body: "Send it to family, friends, neighbors and coworkers. Orders ship directly to the customer." },
  { title: "Claim storefront shifts", body: "Pack-scheduled shifts at local stores are claimed in the Trail's End app, first come, first served." },
  { title: "Turn on tap to pay", body: "Scouts can take credit cards on the phone itself. No card reader needed." },
];
