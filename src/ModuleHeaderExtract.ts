/**
 * @module ModuleHeaderExtract
 * Helpers for reading StrongAI module header blocks embedded in TypeScript sources.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { parseDateYYYYMMDD } from './C4ReadmeUtils';

/** Matches the opening sentinel for a StrongAI generated header comment. */
const SENTINEL_OPEN_RE = /\/\/ ===Start StrongAI Generated Comment \(\d{8}\)===/;

/** Matches the opening sentinel and captures the embedded date. */
const SENTINEL_OPEN_DATE_RE = /\/\/ ===Start StrongAI Generated Comment \((\d{8})\)===/;

/** Closing sentinel for a StrongAI generated header comment. */
const SENTINEL_CLOSE = '// ===End StrongAI Generated Comment===';

/**
 * Extracts the StrongAI generated header block from a source file.
 * Falls back to the full source when no sentinel block is present.
 * @param source - Full TypeScript source text
 * @returns Header block or full source
 */
export function extractModuleHeaderBlock(source: string): string {
   const openMatch = SENTINEL_OPEN_RE.exec(source);
   if (!openMatch) return source;

   const openIndex  = source.indexOf(openMatch[0]);
   const closeIndex = source.indexOf(SENTINEL_CLOSE, openIndex);
   if (closeIndex === -1) return source;

   return source.substring(openIndex, closeIndex + SENTINEL_CLOSE.length);
}

/**
 * Parses the embedded YYYYMMDD date from a module header sentinel, if present.
 * @param source - Full TypeScript source text
 * @returns Parsed header date or null
 */
export function extractModuleHeaderDate(source: string): Date | null {
   const match = SENTINEL_OPEN_DATE_RE.exec(source);
   if (!match) return null;
   return parseDateYYYYMMDD(match[1]);
}
