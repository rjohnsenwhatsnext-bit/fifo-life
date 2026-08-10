# The Lap Map, still to do

Written 10 August 2026. Ordered by what matters, not by how hard it is.

## Blocked on Ryan

- **Two pricing decisions**, before the purchase flow can be built:
  1. **What sits behind the $20.** My argument: the map stays free, because it
     is the hook, it is what Google indexes, and free beats WikiCamps at $9.99
     for anybody comparing. The planner is the paid part, because that is where
     the work went and it is what nobody else has.
  2. **Licence key or accounts.** My argument: a key emailed after checkout,
     typed in once, kept on the device, with a "send it to me again" for a new
     phone. No passwords, no login, nothing to support. Accounts only earn
     their keep if cross device syncing is wanted later.
- **Live Stripe keys**, after the ID verification. The $20 one off product and
  price already exist in test mode.
- **The 301 from `fifolife.au/planner` to `thelapmap.com.au/planner`.** Held
  back until the new domain had traffic, which is circular reasoning: the
  redirect is part of how it gets traffic. Ten minutes.

## Next to build

- **Check in and resume.** The `/api/fill` endpoint is done and answers "where
  do I fill next" from a position along the road and what is left in the tank.
  What is missing is the screen: an "I am here" button per leg that moves you
  along, an "I filled up" that resets the tank, a Navigate button that hands the
  next leg to Apple Maps, and the recommendation shown against where you
  actually are. Apple Maps is already in CarPlay, so that comes free.
- **Name the servo at each fill point** in the "where you have to fill" card. It
  currently says "fill at Rockhampton" because a leg starts there, and has never
  checked whether anything is open there. The servo data is now loaded and can
  answer it.
- **Accommodation in the budget.** 503 of 604 places on a typical route have no
  fee recorded, so there is no honest way to auto fill a nightly cost. What can
  be done is showing the free versus paid mix per leg and letting somebody set
  the split themselves. Revisit once travellers have filled some blanks in.

## Known limits, said out loud

- **Prices only exist in Queensland, New South Wales and Western Australia.**
  SA and NT need paid subscriber tokens on the same scheme; Tasmania needs its
  own source; Victoria and the ACT have no mandatory scheme to join. Everything
  safety related works off whether a servo exists, from OpenStreetMap, which
  covers the country, so a route through SA is never reported as having no fuel.
- **About 70% of camps have no fee, power or phone recorded.** Sites with
  nothing on them say so on screen rather than being presented with the same
  confidence as a park with a phone number.
- **Offline is data and tiles for a saved road, not everything.** Zooms 6 to 11
  along the route, plus site data for the corridor. Panning somewhere you never
  saved will be blank with no signal.
- **No background position tracking.** A web app on iOS stops when the screen
  locks, so proximity warnings only work with the app open. This is the one
  thing that would eventually justify a native build, and only usage can say
  whether it is worth it.

## Housekeeping

- **The dataset is rebuilt by hand.** `node scripts/fetch-parks.mjs`, about ten
  minutes, writes only if every required pass succeeds. A cron on the first of
  the month emails a reminder once it is past sixty days old.
- **`data/parks.backup.json` is a stale copy from before dump points, water and
  servos were added.** Delete it or refresh it; a backup that is two versions
  behind is a trap for whoever reaches for it.
- **Corridor parks take about 700ms warm.** Fine. The gaps endpoint takes five
  seconds on the Nullarbor because it opens the state fuel feeds; worth caching
  if it is ever on a screen somebody waits at.

## Verified working, 10 August 2026

- No secret reaches the browser bundle: fuel tokens, service role, Stripe and
  the photo review key all absent from 660KB of scanned chunks.
- The public key is read only. Every table refuses a write.
- Unapproved photos are invisible to the public key, and the bucket is private.
- A 3MB photo upload is refused, and a link in a place name is refused.
- 29,461 sites: 7,677 servos, 7,949 campgrounds, 2,091 caravan parks, 644 dump
  points, 11,100 taps. Every Eyre Highway roadhouse is present, which is the
  test that matters for the fuel gap warnings.
- Both domains now describe themselves in robots.txt and sitemap.xml.

## Fixed during the review

- **Gap warnings fired on every stretch when fuel figures were blank.** The test
  skipped a stretch only when `range > 0 && run <= range`, so a range of zero
  meant every stretch became a "no fuel" warning. A safety warning that cries
  wolf gets the next one ignored too.
- **Coordinates were never validated.** A stray 999 produced a 9,852km gap.
