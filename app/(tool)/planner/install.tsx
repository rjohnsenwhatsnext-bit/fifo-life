'use client';
import { useEffect, useState } from 'react';

// Putting the planner on a phone's home screen.
//
// The planning happens at a kitchen table months out. The using happens in a
// car park at Gympie with one bar, working out whether to fill up here or push
// on to the next town — and nobody finds a browser tab for that.
//
// Two different jobs underneath. Android hands the page a real install prompt,
// so there is a button that fires it. iOS never has, and never tells the page
// anything, so the only honest thing to do there is say which two taps to make.
// Both disappear the moment the app is actually installed and running, because
// telling somebody to install what they are already inside is how a bar gets
// ignored for the rest of its life.

type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const DISMISSED = 'trip-planner-install-dismissed';

export default function Install() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [ios, setIos] = useState(false);
  const [gone, setGone] = useState(true);

  useEffect(() => {
    // Already installed: standalone on Android and desktop, and Apple's own
    // property on iOS, which never implemented the media query for years.
    const installed = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (installed) return;
    try { if (localStorage.getItem(DISMISSED)) return; } catch {}

    const ua = navigator.userAgent;
    // iPads have reported themselves as Macs since iPadOS 13, so the touch
    // count is what actually separates a tablet from a laptop.
    const isIos = /iPad|iPhone|iPod/.test(ua)
      || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setIos(isIos);
    setGone(false);

    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as Prompt); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setGone(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (gone || (!prompt && !ios)) return null;

  const dismiss = () => {
    setGone(true);
    try { localStorage.setItem(DISMISSED, '1'); } catch {}
  };

  return (
    <div className="install">
      <span className="install-icon" aria-hidden="true" />
      <div className="install-copy">
        <b>Keep this on your phone</b>
        <span>
          {prompt
            ? 'Add the planner to your home screen and it opens like an app, offline map aside.'
            : 'Tap the Share button, then “Add to Home Screen”, and it opens like an app.'}
        </span>
      </div>
      {prompt && (
        <button className="primary" onClick={async () => {
          await prompt.prompt();
          await prompt.userChoice.catch(() => null);
          setGone(true);
        }}>Add to home screen</button>
      )}
      <button className="ghost tiny" onClick={dismiss} aria-label="Dismiss">Not now</button>
    </div>
  );
}
