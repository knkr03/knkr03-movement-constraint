/**
 * Move undo/redo buttons for the Combat Tracker.
 *
 *  <- Move : steps the selected token back one recorded movement using Foundry's own
 *            TokenDocument#revertRecordedMovement(movementId); the movement leaves the
 *            history, so the spent movement is refunded. Shift+click goes back to the
 *            start of the turn.
 *  Move -> : redoes the most recently undone movement. Only offered while nothing else
 *            has changed (same combat/round/turn, history unchanged since the undo,
 *            token not moved elsewhere). The redo list lives in memory on this client.
 */
import { MODULE_ID, setting, log, warn } from "./settings.mjs";

const BAR_CLASS = "move-limiter-bar";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------- history helpers
const history = (doc) => doc.movementHistory ?? [];

function moveCount(doc) {
  const ids = new Set();
  for (const w of history(doc)) if (w.movementId) ids.add(w.movementId);
  return ids.size;
}

function lastMove(doc) {
  const h = history(doc);
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].movementId) return { id: h[i].movementId, action: h[i].action };
  }
  return null;
}

const historyKey = (doc) => `${history(doc).length}:${lastMove(doc)?.id ?? ""}`;

async function waitForChange(doc, before, ms = 2000) {
  const t0 = Date.now();
  while (historyKey(doc) === before && Date.now() - t0 < ms) await sleep(50);
  return historyKey(doc) !== before;
}

const turnKey = () => {
  const c = game.combat;
  return c ? `${c.id}:${c.round}:${c.turn}` : "none";
};

// ----------------------------------------------------------------- redo list
// tokenId -> { turn, anchor, at: {x,y}, entries: [{ to: {x,y,elevation}, action }] }
const redo = new Map();

function validRedo(doc) {
  const s = redo.get(doc.id);
  if (!s) return null;
  const ok = s.entries.length
    && s.turn === turnKey()
    && s.anchor === (lastMove(doc)?.id ?? null)
    && s.at.x === doc.x && s.at.y === doc.y;
  if (!ok) { redo.delete(doc.id); return null; }
  return s;
}

// ------------------------------------------------------------------ stepping
function targetToken() {
  const controlled = canvas.tokens?.controlled?.find((t) => t.document.isOwner);
  const token = controlled ?? game.combat?.combatant?.token?.object ?? null;
  return token?.document?.isOwner ? token : null;
}

let busy = false;

async function undoOne(token) {
  const doc = token.document;
  const move = lastMove(doc);
  if (!move) return false;

  const before = historyKey(doc);
  const entry = { to: { x: doc.x, y: doc.y, elevation: doc.elevation }, action: move.action };
  const prior = validRedo(doc); // fetch while still valid (before the history changes)

  let ok;
  try { ok = await doc.revertRecordedMovement(move.id); }
  catch (err) { warn("revertRecordedMovement failed.", err); return false; }

  const changed = await waitForChange(doc, before);
  if (ok === false || !changed) {
    warn("Undo did not change the movement history.", { ok, changed });
    return false;
  }

  const s = prior ?? { turn: turnKey(), anchor: null, at: null, entries: [] };
  s.entries.push(entry);
  s.anchor = lastMove(doc)?.id ?? null;
  s.at = { x: doc.x, y: doc.y };
  redo.set(doc.id, s);
  log("Undid movement", { token: token.name, movement: move.id, remaining: moveCount(doc), redoable: s.entries.length });
  return true;
}

async function undo(all = false) {
  const token = targetToken();
  if (!token) return ui.notifications.warn(game.i18n.localize("MOVELIMIT.SelectTokenToUndo"));
  if (!token.document.inCombat) {
    return ui.notifications.warn(game.i18n.format("MOVELIMIT.NotInCombat", { name: token.name }));
  }
  if (busy) return;
  busy = true;
  try {
    if (!moveCount(token.document)) {
      return ui.notifications.info(game.i18n.format("MOVELIMIT.NothingToUndo", { name: token.name }));
    }
    do {
      if (!(await undoOne(token))) break;
    } while (all && moveCount(token.document) > 0);
  } finally {
    busy = false;
    refreshBars();
  }
}

async function redoOne() {
  const token = targetToken();
  if (!token) return ui.notifications.warn(game.i18n.localize("MOVELIMIT.SelectTokenToRedo"));
  const doc = token.document;
  const s = validRedo(doc);
  if (!s) return ui.notifications.info(game.i18n.format("MOVELIMIT.NothingToRedo", { name: token.name }));
  if (busy) return;
  busy = true;
  try {
    const entry = s.entries[s.entries.length - 1];
    const waypoint = { x: entry.to.x, y: entry.to.y };
    if (entry.to.elevation != null) waypoint.elevation = entry.to.elevation;
    if (entry.action) waypoint.action = entry.action;

    const before = historyKey(doc);
    await doc.move([waypoint], {
      method: "api",
      constrainOptions: { ignoreWalls: true, ignoreCost: true },
      showRuler: false
    });
    if (!(await waitForChange(doc, before))) { warn("Redo did not change the movement history."); return; }

    s.entries.pop();
    s.anchor = lastMove(doc)?.id ?? null;
    s.at = { x: doc.x, y: doc.y };
    if (!s.entries.length) redo.delete(doc.id);
    log("Redid movement", { token: token.name, moves: moveCount(doc), redoable: s.entries.length });
  } catch (err) {
    warn("Redo failed.", err);
    ui.notifications.error(game.i18n.localize("MOVELIMIT.RedoFailed"));
  } finally {
    busy = false;
    refreshBars();
  }
}

// ------------------------------------------------------------------------ UI
function updateBar(bar) {
  const token = targetToken();
  const doc = token?.document;
  const undoCount = doc?.inCombat ? moveCount(doc) : 0;
  const redoCount = doc?.inCombat ? (validRedo(doc)?.entries.length ?? 0) : 0;
  const undoBtn = bar.querySelector('[data-action="move-undo"]');
  const redoBtn = bar.querySelector('[data-action="move-redo"]');
  undoBtn.disabled = busy || undoCount === 0;
  redoBtn.disabled = busy || redoCount === 0;
  undoBtn.dataset.tooltip = token
    ? game.i18n.format("MOVELIMIT.UndoTooltip", { count: undoCount })
    : game.i18n.localize("MOVELIMIT.SelectToken");
  redoBtn.dataset.tooltip = token
    ? game.i18n.format("MOVELIMIT.RedoTooltip", { count: redoCount })
    : game.i18n.localize("MOVELIMIT.SelectToken");
}

export function refreshBars() {
  const enabled = setting("showUndoButtons");
  document.querySelectorAll(`.${BAR_CLASS}`).forEach((bar) => {
    if (!enabled) bar.remove(); else updateBar(bar);
  });
  if (enabled && ui.combat?.element && !ui.combat.element.querySelector(`.${BAR_CLASS}`)) {
    inject(ui.combat.element);
  }
}

function inject(html) {
  if (!setting("showUndoButtons")) return;
  const root = html instanceof HTMLElement ? html : html?.[0] ?? ui.combat?.element;
  if (!root) return;
  root.querySelector(`.${BAR_CLASS}`)?.remove();

  const label = game.i18n.localize("MOVELIMIT.Move");
  const bar = document.createElement("div");
  bar.className = BAR_CLASS;
  bar.innerHTML = `
    <button type="button" data-action="move-undo"><i class="fa-solid fa-arrow-left"></i> ${label}</button>
    <button type="button" data-action="move-redo">${label} <i class="fa-solid fa-arrow-right"></i></button>`;
  bar.querySelector('[data-action="move-undo"]').addEventListener("click", (ev) => undo(ev.shiftKey));
  bar.querySelector('[data-action="move-redo"]').addEventListener("click", () => redoOne());

  const controls = root.querySelector(".combat-controls")
    ?? root.querySelector("#combat-controls")
    ?? root.querySelector("footer");
  if (controls) controls.before(bar);
  else root.append(bar);
  updateBar(bar);
  log("Undo buttons injected", { anchor: controls ? `${controls.tagName}.${controls.className}` : "root (no controls found)" });
}

// --------------------------------------------------------------------- setup
export function registerUndoHooks() {
  Hooks.on("renderCombatTracker", (app, html) => {
    try { inject(html); } catch (err) { warn("Button injection failed.", err); }
  });
  Hooks.on("updateToken", () => refreshBars());
  Hooks.on("controlToken", () => refreshBars());
  Hooks.on("combatTurnChange", () => setTimeout(refreshBars, 250));
  Hooks.on("updateCombat", () => setTimeout(refreshBars, 250));
}

/** Call once the game is ready: initial injection plus self-healing after tracker re-renders. */
export function startUndoUi() {
  try { if (ui.combat?.rendered) inject(ui.combat.element); }
  catch (err) { warn("Initial injection failed.", err); }

  let timer = null;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        const root = ui.combat?.element;
        if (setting("showUndoButtons") && root?.isConnected && !root.querySelector(`.${BAR_CLASS}`)) {
          log("Undo bar missing after re-render; re-injecting.");
          inject(root);
        }
      } catch (err) { warn("Re-inject failed.", err); }
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });
}

export const undoApi = {
  undo: (all = false) => undo(all),
  redo: () => redoOne(),
  refreshUndoButtons: () => refreshBars(),
  debug: () => {
    const token = targetToken();
    const doc = token?.document;
    const info = {
      target: token?.name ?? null,
      inCombat: doc?.inCombat ?? null,
      historyLength: doc ? history(doc).length : null,
      moves: doc ? moveCount(doc) : null,
      lastMove: doc ? lastMove(doc) : null,
      redo: doc ? validRedo(doc) : null,
      hasRevertApi: typeof doc?.revertRecordedMovement === "function"
    };
    console.log(`${MODULE_ID} | debug`, info);
    return info;
  }
};
