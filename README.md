# Knkr03-Movement Constraint

> Formerly *D&D 5e Movement Limiter & Undo*. The module id (`dnd5e-movement-limiter`), every setting key, hook name, and the `game.modules.get("dnd5e-movement-limiter")` API path are unchanged, so this is a drop-in replacement.

A Foundry VTT v13 module for the D&D 5e system.

- **Movement limit.** A token drag is limited to the actor's *remaining* movement for the movement action selected in Foundry (walk, fly, swim, climb, burrow). Movement already spent this turn is subtracted; when you switch modes the spent distance carries over, per the 5e rules.
- **Extra movement.** When a token's movement is used up, the next drag starts a new full allotment of the active speed, for Dash, Action Surge and other effects that grant more movement. While any movement remains, drags are limited to exactly that remainder. Optionally cap the number of extra allotments per turn.
- **Shift to release.** Hold Shift while dragging and the constraint is lifted for that drag. The release latches until the token is placed, so letting go of Shift before the drop leaves the drag unconstrained; the next drag is limited again.
- **Undo / redo moves.** Two buttons at the bottom of the Combat Tracker step the selected token back one recorded move (refunding the movement) and forward again. Shift+click the back button to return to the start of the turn.

Foundry's normal drag preview, collision, walls and placement still apply: the module only clamps the drag destination.

## How it works

Spent movement is derived from Foundry's own `TokenDocument#movementHistory` (the history you see when hovering a token). Foundry clears it at the start of the token's turn and removes entries when a movement is reverted, so there is no extra state to keep in sync: undoing a move refunds the budget, and revokes an extra allotment that move had started. Undo uses `TokenDocument#revertRecordedMovement`.

The drag limit works by wrapping the callbacks registered on each token's `MouseInteractionManager` (`dragLeftStart`, `dragLeftMove`, `dragLeftDrop`, `dragLeftCancel`).

Shift release is tracked per drag. The drag start reads the Shift state from the pointer event, and because a key press on its own produces no drag event, a `keydown` listener watches for Shift while the drag is in progress. Once released, the drag stays unconstrained until it is placed or cancelled, then the next drag starts fresh.

## Installation

In Foundry's **Add-on Modules** tab choose **Install Module** and paste the manifest URL:

```
https://github.com/knkr03/knkr03-movement-constraint/releases/latest/download/module.json
```

Then enable the module in your world.

## Settings

| Setting | Scope | Default | What it does |
|---|---|---|---|
| GM Bypasses Limit | World | Off | GM drags are never constrained |
| Outside Combat | World | Full speed per drag | Limit for tokens not in combat (or no limit) |
| Combatants Off Their Turn | World | Track movement | Limit when it is not their turn |
| Allow Extra Movement | World | On | New full allotment once movement is used up |
| Max Extra Allotments per Turn | World | 0 (unlimited) | Cap, e.g. 1 for one Dash |
| Used-Up Threshold | World | 0.5 | Remaining at or below this counts as used up (scene units) |
| Measure Zero-Cost Waypoints | World | On | Measure distance when a history step has cost 0 |
| Announce Extra Movement | Client | On | Notification when an allotment is granted |
| Shift Releases the Constraint | Client | On | Hold Shift while dragging to ignore the movement limit for that drag |
| Show Undo/Redo Move Buttons | Client | On | Show the Combat Tracker buttons |
| Debug Logging | Client | Off | Log budgets and undo steps to the console |

## Notes and limitations

- The limit is a straight line from where the drag started. Terrain costs along the path are recorded by Foundry afterwards but are not pre-applied to the drag clamp.
- On gridded scenes, Foundry's snapping can place the token slightly past the clamp. Gridless scenes are exact.
- In multi-token drags only the grabbed token is limited.
- Foundry only records movement history for tokens in combat, so undo/redo applies to combatants.
- The redo list is held in memory on the client that performed the undo, and is discarded when a new move is made or the turn changes.
- The module relies on Foundry v13 internals (interaction callbacks, movement history). Test after core or system updates.
- Other modules that plan token drags and apply this module's budget keep their own snapshot taken at drag start. A release is visible to them through `status()` from the start of that drag, and `Hooks.on("dnd5e-movement-limiter.constraintReleased", ({document}) => …)` announces a mid-drag release; such a module has to honour that signal to lift its own limit.

## Console API

`game.modules.get("dnd5e-movement-limiter").api` provides:

- `status(token)` shows speed, spent, remaining and allotments; while a Shift release is active it also reports `released: true` and `remaining: Infinity`, so modules that enforce their own budget from this value (Knkr03's pathing, for example) do not limit a drag the user just released
- `isReleased(token)` is true while the token's drag has released the constraint
- `history(token)` lists the recorded movements the budget is derived from
- `resetTurn(token)` clears the token's movement history (GM)
- `undo(all = false)`, `redo()`, `debug()`

## Development

No build step. Source is in `scripts/` (ES modules). To release: bump `version` in `module.json`, commit, then publish a GitHub release tagged `vX.Y.Z` with two assets: `module.json` and `module.zip` (a zip of this folder with `module.json` at its root). The `manifest` and `download` URLs in `module.json` assume exactly that asset layout.

This repository carries the module as it ships inside `Data/modules/dnd5e-movement-limiter/`; no build or test tooling is included.

## License

MIT
