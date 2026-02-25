# Soundscape Remix Lab (MVP)

Browser app that:
- uploads audio/video (`mp3`, `mp4`, `mov`, etc.)
- analyzes realtime audio features (RMS loudness, bass/mid/treble energy, rough BPM)
- generates a reactive accompaniment (kick, hats, pad chords, lead notes)
- provides controls for style, reactivity, and frequency focus

## Run

Open `index.html` in a modern browser (Chrome/Edge/Safari).

## Notes

- This version uses the Web Audio API directly (no external runtime dependencies).
- Click `Start Reactive Engine` after selecting a file to unlock browser audio and begin generation.
- BPM is estimated from low-frequency pulse detection and smoothed over time.
