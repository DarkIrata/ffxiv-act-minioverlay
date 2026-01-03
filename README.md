## Installation

1. OverlayPlugin.dll tab
2. New
3. Preset > Custom, Type > MiniParse
4. Pick the overlay you just created
5. URL: Paste the URL for either the "dev" or "stable" release
   * dev: `https://darkirata.github.io/ffxiv-act-minioverlay/releases/dev/`
   * stable: `https://darkirata.github.io/ffxiv-act-minioverlay/releases/stable/`

## Changelog

### dev

* Fixed color for Gladiator and icon for Marauder

### 03-01-2026

* Add Pictomancer and Viper


### Extensions

Forked from https://github.com/dpatti/ffxiv-overlay
Credits goes to dpatty and billyvg

- meters: uptime tracking to be limited to spells with damage/healing components
  so that, e.g., a BLM spamming Umbral Soul isn't at 100% uptime.
- meters: have a dual-bar setup for visualizing healing vs overhealing
- timers: add more buff/debuff data
- timers: make buff/debuff selection configurable
- timers: if possible, reset the state when a wipe happens
- timers: show how many targets multi-target actions hit
- timers: more distinct effect when a buff window starts
- countdown: smoother bar
- meta: do a pass to clean up CSS
