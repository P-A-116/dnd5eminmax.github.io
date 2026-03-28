/* =========================================================
   optimizer.worker.js – Web Worker for optimizer execution.
   Runs buildOneClassResult for every class in the given pool
   without blocking the UI thread.

   Module worker: must be loaded with { type: "module" }.

   Message protocol
   ─────────────────
   main → worker:
     { type: "start",  payload: { classPool, objective, assumptions } }
     { type: "cancel" }      (not strictly needed – main can terminate())

   worker → main:
     { type: "progress", payload: { processed, total } }
     { type: "result",   payload: sortedResultsArray }
     { type: "error",    payload: { message } }
   ========================================================= */

import { buildOneClassResult } from "./optimizer-engine.js";

let _cancelled = false;

self.onmessage = function (e) {
  const { type, payload } = e.data || {};

  if (type === "cancel") {
    _cancelled = true;
    return;
  }

  if (type === "start") {
    _cancelled = false;
    const { classPool, objective, assumptions } = payload;

    try {
      const results = [];
      const total   = classPool.length;

      for (let i = 0; i < total; i++) {
        if (_cancelled) return; // exit early; main will handle termination

        const classKey = classPool[i];
        const result   = buildOneClassResult(classKey, objective, assumptions);
        if (result !== null) results.push(result);

        // Post incremental progress after each class
        self.postMessage({ type: "progress", payload: { processed: i + 1, total } });
      }

      // Sort and return
      results.sort((a, b) => b.score - a.score);
      self.postMessage({ type: "result", payload: results });
    } catch (err) {
      self.postMessage({ type: "error", payload: { message: err.message || String(err) } });
    }
  }
};
