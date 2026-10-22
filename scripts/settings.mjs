export const MODULE_ID = "dnd5e-movement-limiter";

/** Read a module setting. */
export const setting = (key) => game.settings.get(MODULE_ID, key);

/** Console logger that respects the debug setting. */
export const log = (...args) => {
  try { if (setting("debug")) console.log(`${MODULE_ID} |`, ...args); } catch (err) { /* settings not ready */ }
};
export const warn = (...args) => console.warn(`${MODULE_ID} |`, ...args);

const L = (key) => `MOVELIMIT.Settings.${key}`;

export function registerSettings() {
  const reg = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `${L(key)}.name`,
    hint: `${L(key)}.hint`,
    config: true,
    ...data
  });

  reg("gmBypass", { scope: "world", type: Boolean, default: false });

  reg("outOfCombat", {
    scope: "world", type: String, default: "full",
    choices: { full: `${L("outOfCombat")}.full`, none: `${L("outOfCombat")}.none` }
  });

  reg("offTurn", {
    scope: "world", type: String, default: "turn",
    choices: {
      turn: `${L("offTurn")}.turn`,
      full: `${L("offTurn")}.full`,
      none: `${L("offTurn")}.none`
    }
  });

  reg("allowExtraMovement", { scope: "world", type: Boolean, default: true });
  reg("maxExtraAllotments", { scope: "world", type: Number, default: 0 });
  reg("exhaustedThreshold", { scope: "world", type: Number, default: 0.5 });
  reg("measureFallback", { scope: "world", type: Boolean, default: true });

  reg("notify", { scope: "client", type: Boolean, default: true });
  reg("shiftBypass", { scope: "client", type: Boolean, default: true });
  reg("showUndoButtons", {
    scope: "client", type: Boolean, default: true,
    onChange: () => game.modules.get(MODULE_ID)?.api?.refreshUndoButtons?.()
  });
  reg("debug", { scope: "client", type: Boolean, default: false });
}
