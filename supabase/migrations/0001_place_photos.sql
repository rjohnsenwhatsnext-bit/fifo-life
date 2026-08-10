-- Photos travellers take of the sites.
--
-- This is the answer to "how does WikiCamps have photos of everywhere". They do
-- not license them from anybody. Fifteen years of people who stayed somewhere
-- photographing it is the whole product, and there is no shortcut to it except
-- to start.
--
-- Photos attach to a point rather than to a row in this database, because most
-- of what is on the map is not in this database: ten thousand OpenStreetMap
-- sites have no row here and never will. The key is the rounded coordinate,
-- which is the same id the parks route already hands out, so a photo taken at a
-- site found on the map lands on that site without either side needing to know
-- about the other.
--
-- Nothing is public until somebody says so.
--
-- There are no accounts on this site. An open text field invites spam, which
-- gets hidden and forgotten; an open image upload invites something worse, and
-- the something worse would be sitting on our domain. So an upload is stored,
-- shown straight back to the person who sent it, and seen by nobody else until
-- it is approved. That is a deliberate cost: it means photos appear late rather
-- than never, and it means this cannot become a way to publish anything.

create table if not exists place_photos (
  id uuid primary key default gen_random_uuid(),

  -- "-21.14251,149.18213". The parks route builds the same string, so they
  -- match without a join or a lookup table.
  site_key text not null,
  -- Kept as numbers too, so photos can be found by area rather than only by
  -- exact key when a site moves a few metres between OSM edits.
  lat double precision not null,
  lng double precision not null,

  -- What it is a photo of, so a review page can be read without a map open.
  site_name text,

  path text not null unique,
  added_by text,

  -- The two states that matter, kept apart on purpose. Approved is the gate a
  -- photo passes once; hidden is the switch that takes an approved photo back
  -- down without losing the record that it existed.
  approved boolean not null default false,
  hidden boolean not null default false,

  -- Hashed and salted, the same as the places table. Enough to rate limit and
  -- to pull every upload from one source if one turns bad, and never enough to
  -- identify a person.
  source text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists place_photos_site on place_photos (site_key) where approved and not hidden;
create index if not exists place_photos_area on place_photos (lat, lng) where approved and not hidden;
create index if not exists place_photos_queue on place_photos (created_at) where not approved;

alter table place_photos enable row level security;

-- The browser holds a key that can read and nothing else, and it may only read
-- what has been approved. Every write goes through the route handler with the
-- service role, where it can be checked.
drop policy if exists "anyone reads approved photos" on place_photos;
create policy "anyone reads approved photos" on place_photos
  for select using (approved and not hidden);
