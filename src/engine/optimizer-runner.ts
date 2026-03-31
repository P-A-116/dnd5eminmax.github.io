// @ts-nocheck
/* =========================================================
   Optimizer Runner
   Provides non-blocking (async, chunked) execution of the
   optimizer loop, with cancellation support and throttled
   progress reporting.

   Works without a build step – pure ESM, no dependencies
   beyond optimizer-constants.js.
   ========================================================= */

import { ASYNC_CHUNK_SIZE, PROGRESS_THROTTLE_MS } from "../utils/optimizer-constants";

// =========================================================
// Cancel Token
// =========================================================

/**
 * Lightweight cancel token.
 * Create one per optimization run; call .cancel() to signal
 * that the runner should stop at the next chunk boundary.
 */
export class CancelToken {
  constructor() {
    this.cancelled = false;
  }
  cancel() {
    this.cancelled = true;
  }
}

// =========================================================
// Async helpers
// =========================================================

/**
 * Yield control back to the browser event loop.
 * Prefers requestAnimationFrame for smooth rendering; falls
 * back to setTimeout(0) in environments without rAF.
 *
 * @returns {Promise<void>}
 */
function yieldControl() {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// =========================================================
// Main async runner
// =========================================================

/**
 * Run the optimizer loop asynchronously in chunks so the
 * browser can repaint and handle user input between chunks.
 *
 * @param {string[]}    pool        - Class keys to evaluate.
 * @param {Function}    buildOneFn  - Sync function: (classKey) => result | null.
 * @param {CancelToken} cancelToken - Token used to request early cancellation.
 * @param {Function}    [onProgress]
 *   Optional callback: ({ processed: number, total: number, phase: string }) => void.
 *   Called at most once per PROGRESS_THROTTLE_MS during the generating phase,
 *   and once at the start of the sorting phase.
 *
 * @returns {Promise<Array|null>}
 *   Resolves to the sorted results array, or null if the run was cancelled.
 */
export async function runOptimizerAsync(pool, buildOneFn, cancelToken, onProgress) {
  const total = pool.length;
  const results = [];
  let lastProgressMs = 0;

  for (let i = 0; i < total; i += ASYNC_CHUNK_SIZE) {
    if (cancelToken.cancelled) return null;

    const chunkEnd = Math.min(i + ASYNC_CHUNK_SIZE, total);

    for (let j = i; j < chunkEnd; j++) {
      if (cancelToken.cancelled) return null;
      const result = buildOneFn(pool[j]);
      if (result !== null) results.push(result);
    }

    // Throttled progress report
    const now = Date.now();
    if (onProgress && now - lastProgressMs >= PROGRESS_THROTTLE_MS) {
      onProgress({ processed: chunkEnd, total, phase: "generating" });
      lastProgressMs = now;
    }

    // Yield to browser between chunks
    await yieldControl();
  }

  if (cancelToken.cancelled) return null;

  // Sorting phase
  if (onProgress) onProgress({ processed: total, total, phase: "sorting" });
  await yieldControl();

  return results.sort((a, b) => b.score - a.score);
}
