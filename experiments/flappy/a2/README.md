# Neonfall

Neonfall is a portrait-first, one-touch arcade game built with Phaser 4 and
strict TypeScript. The mote falls automatically; tap to reverse its sideways
drift and thread the procedural gaps. The project includes responsive DPR-aware
rendering, deterministic game logic, procedural visuals and audio, persistent
best score and mute settings, and an installable offline PWA.

## Run it

```sh
npm ci
npm run dev
```

Use touch/click, Space, Left Arrow, or Right Arrow. The first input starts a
run; later inputs turn. Walls are safe, neon barriers are not.

## Next

Given more time, I would add automated browser-level visual checks on a real
Android Chrome device, then consider the optional best-run ghost described in
the implementation plan.

## Unfinished

No known gameplay or build work is unfinished. Device-level install prompting,
safe-area behavior on notched hardware, and audio/haptics still benefit from a
final physical-device pass.
