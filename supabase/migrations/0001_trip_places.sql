-- Camps and things to do, added by whoever knows about them.
--
-- OpenStreetMap is good at infrastructure and blind to word of mouth. The
-- gravel pull-off past the bridge, the showground that takes vans for a gold
-- coin, the swimming hole nobody signposts: none of it is mapped, and all of it
-- is why the trip is worth doing. WikiCamps knows some and will not share it.
--
-- So this is the shared version. One person adds a camp and everybody planning
-- through that town sees it.
--
-- There are no accounts on this site, which means an open write. Every guard
-- below exists because of that: the limits are in the column definitions so a
-- bug in the route cannot get around them, and nothing is ever hard deleted,
-- only hidden, so a bad decision is reversible.

create table if not exists trip_places (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('camp', 'thing')),
  -- Length caps in the database, not only in the form. A route handler can be
  -- bypassed the day somebody finds the endpoint; a check constraint cannot.
  name text not null check (char_length(btrim(name)) between 2 and 80),
  -- Roughly the Australian mainland and Tasmania. A camp in Nebraska is spam.
  lat double precision not null check (lat between -44 and -9),
  lng double precision not null check (lng between 112 and 154),
  nightly numeric(6,2) check (nightly >= 0 and nightly <= 500),
  what text check (char_length(what) <= 60),
  note text check (char_length(note) <= 280),
  added_by text check (char_length(added_by) <= 40),
  -- Hidden rather than deleted. Somebody's genuine camp taken down by mistake
  -- should be one update away from coming back.
  status text not null default 'live' check (status in ('live', 'hidden')),
  -- Salted hash, never the address itself. Enough to rate limit one person
  -- adding forty camps in a minute, useless for working out who they are.
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists trip_places_live on trip_places (status, lat, lng);
create index if not exists trip_places_ip on trip_places (ip_hash, created_at desc);

alter table trip_places enable row level security;

-- Anyone may read what is live.
drop policy if exists trip_places_read on trip_places;
create policy trip_places_read on trip_places
  for select using (status = 'live');

-- Deliberately no insert, update or delete policy. The anon key the browser
-- carries can read and nothing else; every write goes through the server route
-- with the service role, which is the only place validation and rate limiting
-- can actually be enforced.
