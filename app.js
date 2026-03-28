/* =========================================================
   D&D 5e SRD-Safe Character Builder + Optimizer
   Entry point – bootstraps the application.

   Modules loaded:
     dnd-engine.js       – D&D 5e rules math
     dnd-data.js         – Shared data tables
     validation.js       – State normalisation & validation
     optimizer-constants.js – Tuning knobs
     optimizer-runner.js – Async chunked runner (fallback)
     optimizer-engine.js – Pure build evaluation logic
     diagnostics.js      – Unified error / warning panel
     state.js            – Application state singleton
     persistence.js      – localStorage w/ versioning
     render.js           – DOM rendering
     optimizer-ui.js     – Optimizer orchestration (worker + fallback)
     events.js           – Event wiring
   ========================================================= */

import { initState }   from "./state.js";
import { setStatus }   from "./diagnostics.js";
import { render }      from "./render.js";
import { wireEvents }  from "./events.js";

document.addEventListener("DOMContentLoaded", () => {
  try {
    initState();
    render();
    wireEvents();
    setStatus("Loaded.");
  } catch (error) {
    console.error("Initialization failed:", error);
    setStatus("⚠ App initialization failed", true);
  }
});
