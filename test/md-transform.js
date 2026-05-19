/**
 * Jest transform for .md files — replaces md-require-hook.ts.
 */
// Copyright (c) 2025, 2026 Jon Verrier

/** @param {string} sourceText */
module.exports = {
   process(sourceText) {
      return { code: `module.exports = ${JSON.stringify(sourceText)};` };
   }
};
