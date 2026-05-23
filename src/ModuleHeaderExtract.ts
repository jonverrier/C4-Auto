/**
 * @module ModuleHeaderExtract
 * Single source of truth for StrongAI module header sentinel markers and extraction helpers.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { formatDateYYYYMMDD, parseDateYYYYMMDD } from './C4ReadmeUtils';

/** Opening sentinel prefix (date appended before suffix). */
export const SENTINEL_OPEN_PREFIX = '// ===Start StrongAI Generated Comment (';

/** Opening sentinel suffix (follows YYYYMMDD date). */
export const SENTINEL_OPEN_SUFFIX = ')===';

/** Closing sentinel line for a generated header block. */
export const SENTINEL_CLOSE = '// ===End StrongAI Generated Comment===';

/** Line-start opening sentinel with captured YYYYMMDD date. */
export const SENTINEL_OPEN_LINE_START_RE = /^\/\/ ===Start StrongAI Generated Comment \((\d{8})\)===/m;

/** Opening sentinel anywhere in source with captured date (handles merged JSDoc cases). */
export const SENTINEL_OPEN_FLEXIBLE_RE = /\/\/ ===Start StrongAI Generated Comment \((\d{8})\)===/;

/** Opening sentinel anywhere in source without capture (block boundary search). */
export const SENTINEL_OPEN_ANYWHERE_RE = /\/\/ ===Start StrongAI Generated Comment \(\d{8}\)===/;

/**
 * Extracts the StrongAI generated header block from a source file.
 * Falls back to the full source when no sentinel block is present.
 * @param source - Full TypeScript source text
 * @returns Header block or full source
 */
export function extractModuleHeaderBlock(source: string): string {
   const openMatch = SENTINEL_OPEN_ANYWHERE_RE.exec(source);
   if (!openMatch) return source;

   const openIndex  = source.indexOf(openMatch[0]);
   const closeIndex = source.indexOf(SENTINEL_CLOSE, openIndex);
   if (closeIndex === -1) return source;

   return source.substring(openIndex, closeIndex + SENTINEL_CLOSE.length);
}

/**
 * Parses the embedded YYYYMMDD date from a module header sentinel, if present.
 * Checks line-start first, then flexible match for merged sentinels.
 * @param source - Full TypeScript source text
 * @returns Parsed header date or null
 */
export function extractModuleHeaderDate(source: string): Date | null {
   let match = SENTINEL_OPEN_LINE_START_RE.exec(source);
   if (!match) {
      match = SENTINEL_OPEN_FLEXIBLE_RE.exec(source);
   }
   if (!match) return null;
   return parseDateYYYYMMDD(match[1]);
}

/**
 * Removes all StrongAI generated header blocks from source.
 * Handles merged sentinels by also removing the preceding JSDoc close when needed.
 * @param source - Full TypeScript source text
 * @returns Source with generated header blocks removed
 */
export function stripModuleHeaderBlocks(source: string): string {
   let result = source;
   const re = new RegExp(SENTINEL_OPEN_FLEXIBLE_RE.source, 'g');
   let openMatch: RegExpExecArray | null;
   while ((openMatch = re.exec(result)) !== null) {
      const sentinelStart = openMatch.index;
      const closeIndex = result.indexOf(SENTINEL_CLOSE, sentinelStart);
      if (closeIndex === -1) break;

      const afterClose = result.indexOf('\n', closeIndex + SENTINEL_CLOSE.length);
      const endIndex = afterClose === -1 ? result.length : afterClose + 1;

      const lineStart = result.lastIndexOf('\n', sentinelStart - 1) + 1;
      const lineBeforeSentinel = result.substring(lineStart, sentinelStart);
      const mergedMatch = /(\*\/)\s*$/.exec(lineBeforeSentinel);
      const removeFrom = mergedMatch ? lineStart + mergedMatch.index : sentinelStart;

      result = result.substring(0, removeFrom) + result.substring(endIndex);
      re.lastIndex = 0;
   }
   return result;
}

/**
 * Wraps LLM-generated plain text in StrongAI sentinel markers with `//` line prefixes.
 * @param generatedComment - Plain-text comment from the LLM
 * @param jobStartedAt - Job timestamp embedded in the opening sentinel
 * @returns Sentinel block including trailing blank line
 */
export function buildModuleHeaderBlock(generatedComment: string, jobStartedAt: Date): string {
   const dateStr   = formatDateYYYYMMDD(jobStartedAt);
   const openLine  = `${SENTINEL_OPEN_PREFIX}${dateStr}${SENTINEL_OPEN_SUFFIX}`;
   const commentLines = generatedComment
      .split('\n')
      .map(line => `// ${line}`)
      .join('\n');

   return `${openLine}\n${commentLines}\n${SENTINEL_CLOSE}\n\n`;
}
