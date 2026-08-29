"use client";

import { useEffect, useRef, useState } from "react";

// Your van, as three lists.
//
// WHY THERE IS NO ACCOUNT
// -----------------------
// The planner next door keeps everything in localStorage and says so on the
// page: "there is no login, because a tool that wants your email before it
// answers anything is not a tool". The same is true here and more so. This gets
// opened standing at the van in a shed, or on a site with one bar, working out
// whether the water filter got done. A sign-in wall in front of a checklist is
// the reason people go back to a bit of paper.
//
// It also means there is nothing of anybody's on a server: no account to be
// breached, no data to be responsible for, no backup obligation. The cost is
// that the lists live on the phone that wrote them, which for a checklist is
// the right trade. It is stated on the page rather than left to be discovered.
//
// THREE LISTS, NOT ONE
// --------------------
// Jobs, packing and shopping are the same widget three times, and they are kept
// apart because they empty at different moments. Jobs get ticked in the shed
// the week before. Packing gets ticked the morning you go, and then wants
// resetting for next trip, which is why only that one has a reset. Shopping
// gets ticked in a Woolworths in a town you have never been to.

type Item = { id: string; name: string; done: boolean };
type ListKey = "jobs" | "packing" | "groceries" | "shopping";

const LISTS: { key: ListKey; tab: string; title: string; hint: string; placeholder: string; empty: string }[] = [
  { key: "jobs", tab: "Jobs", title: "Jobs on the van", placeholder: "Add a job",
    hint: "What has to be done before it goes anywhere.",
    empty: "No jobs on the van." },
  { key: "packing", tab: "Packing", title: "Packing", placeholder: "Add something to pack",
    hint: "Ticked on the morning you leave. Reset it when you get home.",
    empty: "Nothing on the packing list yet." },
  // Two shopping lists, because they are two different shops. Food is bought
  // constantly and in whatever town you are in; a sullage hose or an anode rod
  // comes from a camping shop or a mechanic and might wait a fortnight. One
  // list holding both means scrolling past the tyres to find the tea bags,
  // which is the same reason the jobs are not in here either.
  { key: "groceries", tab: "Groceries", title: "Groceries", placeholder: "Add something",
    hint: "Food and the rest of the shop.",
    empty: "Nothing on the list." },
  { key: "shopping", tab: "Bits", title: "Bits for the van", placeholder: "Add something to get",
    hint: "Parts, gas, bits and pieces. Not the food.",
    empty: "Nothing to get." },
];

const KEY = (k: ListKey) => `lapmap-van-${k}`;

// A trip's worth of a checklist, on a phone that may have been offline for a
// week. Nothing here is worth a network call.
function read(k: ListKey): Item[] {
  try {
    const raw = localStorage.getItem(KEY(k));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => x && typeof x.name === "string") : [];
  } catch {
    // A corrupt list reads as an empty one rather than a crash. Somebody
    // standing at a van does not care why, and a white screen is the worst
    // possible answer to a checklist.
    return [];
  }
}

function write(k: ListKey, items: Item[]) {
  try { localStorage.setItem(KEY(k), JSON.stringify(items)); } catch { /* private mode, full disk */ }
}

const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export default function Van() {
  const [lists, setLists] = useState<Record<ListKey, Item[]>>({ jobs: [], packing: [], groceries: [], shopping: [] });
  // Nothing is read until the browser is there. On the server localStorage does
  // not exist, and rendering an empty list and then filling it in is what makes
  // a hydration mismatch.
  const [ready, setReady] = useState(false);
  // Opens on the jobs, because "is it ready to go" is the question that
  // brings anybody here in the first place.
  const [view, setView] = useState<ListKey>("jobs");

  useEffect(() => {
    setLists({ jobs: read("jobs"), packing: read("packing"),
               groceries: read("groceries"), shopping: read("shopping") });
    setReady(true);
  }, []);

  function update(k: ListKey, next: Item[]) {
    setLists((l) => ({ ...l, [k]: next }));
    write(k, next);
  }

  const add = (k: ListKey, name: string) =>
    update(k, [...lists[k], { id: newId(), name: name.trim(), done: false }]);

  const toggle = (k: ListKey, id: string) =>
    update(k, lists[k].map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  const remove = (k: ListKey, id: string) =>
    update(k, lists[k].filter((i) => i.id !== id));

  const clearDone = (k: ListKey) => update(k, lists[k].filter((i) => !i.done));

  // Untick everything, keeping the list. The whole point of a packing list is
  // that it is the same list every trip: deleting it and writing it again is
  // what people do with paper and is exactly what this should stop.
  const untickAll = (k: ListKey) =>
    update(k, lists[k].map((i) => ({ ...i, done: false })));

  if (!ready) return <div className="van-loading">Getting your van…</div>;

  const jobsLeft = lists.jobs.filter((i) => !i.done).length;

  return (
    <div className="van">
      <div className="van-state">
        {lists.jobs.length === 0
          ? "Add the jobs that need doing before it goes anywhere."
          : jobsLeft === 0
            ? "Every job is ticked. The van is ready."
            : `${jobsLeft} ${jobsLeft === 1 ? "job" : "jobs"} still to do on the van.`}
      </div>

      {/* Sub tabs rather than three stacked cards, the same shape the family
          app uses inside House. Three lists down one page is a lot of thumb on
          a phone, and the one you want is never the one on screen. One at a
          time, and the count on the pill says whether the others need you. */}
      <nav className="van-nav">
        {LISTS.map((l) => {
          const left = lists[l.key].filter((i) => !i.done).length;
          return (
            <button key={l.key}
                    className={view === l.key ? "van-navbtn on" : "van-navbtn"}
                    onClick={() => setView(l.key)}
                    aria-current={view === l.key ? "page" : undefined}>
              {l.tab}
              {left > 0 && <span className="van-count">{left}</span>}
            </button>
          );
        })}
      </nav>

      {LISTS.filter((l) => l.key === view).map((l) => (
        <List
          key={l.key}
          def={l}
          items={lists[l.key]}
          onAdd={(name) => add(l.key, name)}
          onToggle={(id) => toggle(l.key, id)}
          onRemove={(id) => remove(l.key, id)}
          onClearDone={() => clearDone(l.key)}
          onUntickAll={l.key === "packing" ? () => untickAll(l.key) : undefined}
        />
      ))}

      <p className="van-privacy">Saved on this phone. No account, no sign in.</p>
    </div>
  );
}

function List({ def, items, onAdd, onToggle, onRemove, onClearDone, onUntickAll }: {
  def: (typeof LISTS)[number];
  items: Item[];
  onAdd: (name: string) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearDone: () => void;
  /** Packing only. The other two are not the same list every trip. */
  onUntickAll?: () => void;
}) {
  const [text, setText] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const done = items.filter((i) => i.done).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = text.trim();
    if (!name) return;
    setText("");
    onAdd(name);
    // Straight back to the box. Adding one thing usually means adding four, and
    // on a phone the keyboard closing between each is what makes people give up
    // halfway and finish the list in their head.
    input.current?.focus();
  }

  // The shopping list is the one that gets taken somewhere, so it is the one
  // that looks like the thing it replaced: a pad off the fridge. The other two
  // stay plain, because handwriting on a list of jobs would be a costume.
  const pad = def.key === "shopping" || def.key === "groceries";

  return (
    <section className={pad ? "van-card pad" : "van-card"}>
      <header className="van-card-top">
        <h2>{def.title}</h2>
        <p>{def.hint}</p>
      </header>

      <form className="van-add" onSubmit={submit}>
        <input
          ref={input}
          className="van-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={def.placeholder}
          aria-label={def.placeholder}
          enterKeyHint="done"
          autoComplete="off"
        />
        <button className="van-btn" type="submit" disabled={!text.trim()}>Add</button>
      </form>

      {items.length === 0 ? (
        <p className="van-empty">{def.empty}</p>
      ) : (
        <ul className="van-list">
          {items.map((i) => (
            <li key={i.id} className={i.done ? "van-item done" : "van-item"}>
              <button className="van-tick" onClick={() => onToggle(i.id)}
                      aria-pressed={i.done} aria-label={`${i.done ? "Untick" : "Tick"} ${i.name}`}>
                <span className="van-box" />
                <span className="van-name">{i.name}</span>
              </button>
              <button className="van-x" onClick={() => onRemove(i.id)}
                      aria-label={`Take ${i.name} off the list`}>×</button>
            </li>
          ))}
        </ul>
      )}

      {done > 0 && (
        <div className="van-actions">
          {onUntickAll && (
            <button className="van-btn ghost" onClick={onUntickAll}>
              Untick all, for the next trip
            </button>
          )}
          <button className="van-btn ghost" onClick={onClearDone}>
            Clear the {done} ticked
          </button>
        </div>
      )}
    </section>
  );
}
