# Meditation

A tiny installable PWA that plays your own meditation audio file.

- The audio is **never uploaded**: you pick it on your phone, and it is stored locally in the app's IndexedDB.
- Lock-screen / notification controls via the Media Session API; keeps playing with the screen off.
- Remembers where you stopped.
- Works offline after first load (service worker caches the app shell).

Open the site in Chrome on Android → menu → **Install app** / **Add to Home screen**.
