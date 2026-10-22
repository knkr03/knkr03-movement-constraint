import { MODULE_ID, registerSettings, warn } from "./settings.mjs";
import {
  registerConstraintHooks, installOnAllTokens, uninstallConstraint, constraintApi
} from "./constrain.mjs";
import { registerUndoHooks, startUndoUi, undoApi } from "./undo.mjs";

Hooks.once("init", () => {
  registerSettings();
  registerConstraintHooks();
  registerUndoHooks();
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") warn("This module is designed for the D&D 5e system; actors without 5e movement data are not limited.");

  const module = game.modules.get(MODULE_ID);
  module.api = { ...constraintApi, ...undoApi, uninstall: uninstallConstraint };

  if (canvas.ready) installOnAllTokens();
  startUndoUi();
});
