## Installation

1. OverlayPlugin.dll tab
2. New
3. Preset > Custom, Type > MiniParse
4. Pick the overlay you just created
5. URL: Paste the URL for either the "dev" or "stable" release
   * dev: `https://dpatti.github.io/ffxiv-overlay/releases/dev/`
   * stable: `https://dpatti.github.io/ffxiv-overlay/releases/stable/`

## Changelog

### v5 (2022-01-30)

* Added Sage and Reaper
* Fixed bug where encounters show a duration of -1:00
* NPCs are now filtered out

### v4 (2021-03-21)

* Added new view for uptime based on action use
* Automatically tracks the player's name and replaces "YOU"
* Displays total encounter time instead of ACT's combat time
* Filters out encounters with no combatants

### v3 (2021-03-06)

* Shows limit break and other sources
* New, cleaner class icons
* Resets view to new encounter when it starts
* Added new view for deaths

### v2 (2021-02-17)

* Changed class colors to match fflogs
* Fixed sorting of damage meters when dps is unknown due to an upstream
  encounter duration glich
* Encounters in the drop-down have their times with them
* Fixed the encounter drop-down not updating the meters sometimes
* Remove the "End encounter" button and make the mode toggle display raid dps
  and hps
* Encounter history persists between reloads

### v1 (2021-01-23)

* Initial fork of [rdmty](https://github.com/billyvg/OverlayPlugin-themes)
* Added raid dps to header
* Added optional `?you=My_Name` to show your own name
* Numbers in the millions are formatted as 1.23M

## In development

```
yarn serve
```

### Extensions

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
