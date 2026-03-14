/**
 * @module ModuleHeaderVisitor
 * Directory visitor that generates and inserts LLM-authored header comment blocks
 * into TypeScript source files. Uses sentinel markers to detect and replace stale
 * or missing generated headers while preserving existing file content.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// Generates and maintains LLM-authored header comment blocks for TypeScript files. Scans .ts and .tsx files, detects existing StrongAI sentinel headers with embedded YYYYMMDD dates, evaluates staleness against a configurable time window, and replaces or inserts fresh headers while preserving file content.
//
// Main export: ModuleHeaderVisitor implements IDirectoryVisitor with priority kFirst. visit iterates files and delegates to processFile, which reads the file, checks staleness, fetches a prompt by moduleHeaderCommentPromptId, invokes the LLM via IChatDriver, strips any existing sentinel block, and inserts a new header after the @module block or copyright (or shebang if neither).
//
// Key helpers: findInsertionPoint (after @module/copyright/shebang), stripGeneratedHeader (removes blocks including merged sentinels), buildNewHeader, extractHeaderDate, isStale.
// ===End StrongAI Generated Comment===

import {
   EVerbosity,
   IChatDriver,
   IPromptRepository,
   InvalidOperationError
} from '@jonverrier/prompt-repository';

import {
   ETimeWindow,
   EVisitorPriority,
   IDocGenOptions,
   IFileReader,
   IFileWriter,
   IDirectoryVisitor
} from './DocGenTypes';

import { moduleHeaderCommentPromptId } from './PromptIds';
import { MS_PER_DAY, TIME_WINDOW_DAYS, formatDateYYYYMMDD, parseDateYYYYMMDD } from './DateUtils';

// Target word count for the LLM-generated comment block.
const MODULE_COMMENT_WORD_COUNT = 150;

// Sentinel markers embedded in generated header blocks.
const SENTINEL_OPEN_PREFIX  = '// ===Start StrongAI Generated Comment (';
const SENTINEL_OPEN_SUFFIX  = ')===';
const SENTINEL_CLOSE        = '// ===End StrongAI Generated Comment===';

// Regex to find and capture the YYYYMMDD date from an existing sentinel opening.
// Uses ^ for extractHeaderDate (prefer line-start matches). Strip uses SENTINEL_OPEN_FLEXIBLE_RE.
const SENTINEL_OPEN_RE = /^\/\/ ===Start StrongAI Generated Comment \((\d{8})\)===/m;
// Finds sentinel anywhere (handles merged case: */// ===Start...).
const SENTINEL_OPEN_FLEXIBLE_RE = /\/\/ ===Start StrongAI Generated Comment \((\d{8})\)===/;

// Regex to find the first JSDoc block containing @module (from /** to */).
const MODULE_BLOCK_RE = /\/\*\*[\s\S]*?@module[\s\S]*?\*\//;

// Regex for copyright: block comment (/* ... Copyright ... */) or single-line (// ... Copyright ...).
// Block form must not span across */ — use (?:(?!\*\/)[\s\S])*? so we match only within a single block.
const COPYRIGHT_BLOCK_RE = /\/\*(?:(?!\*\/)[\s\S])*?Copyright[\s\S]*?\*\//i;
const COPYRIGHT_LINE_RE  = /\/\/[^\n]*Copyright[^\n]*/im;

// Only search for delimiters in the preamble (avoids matching copyright/@module in later JSDoc).
const PREAMBLE_LINE_LIMIT = 25;

/**
 * Returns the index immediately after the given match (including its trailing newline).
 */
function indexAfterLine(match: string, inText: string): number {
   const endIndex = inText.indexOf(match) + match.length;
   const afterNewline = inText.indexOf('\n', endIndex);
   return afterNewline === -1 ? endIndex : afterNewline + 1;
}

/**
 * Returns the index at which to insert the generated header block.
 * Inserts after the later of: shebang, @module block, copyright.
 * Only searches the preamble (first PREAMBLE_LINE_LIMIT lines) to avoid matching
 * copyright or @module text inside later JSDoc blocks.
 * @param source - File content (with generated header already stripped)
 * @returns Insertion index
 */
function findInsertionPoint(source: string): number {
   const lines = source.split('\n');
   const preamble = lines.slice(0, PREAMBLE_LINE_LIMIT).join('\n');

   let best = 0;

   // 1. Shebang
   if (source.startsWith('#!')) {
      const nl = source.indexOf('\n');
      best = Math.max(best, nl === -1 ? source.length : nl + 1);
   }

   // 2. @module block
   const moduleMatch = preamble.match(MODULE_BLOCK_RE);
   if (moduleMatch) {
      best = Math.max(best, indexAfterLine(moduleMatch[0], source));
   }

   // 3. Copyright (block or line)
   const blockMatch = preamble.match(COPYRIGHT_BLOCK_RE);
   if (blockMatch) {
      best = Math.max(best, indexAfterLine(blockMatch[0], source));
   }
   const lineMatch = preamble.match(COPYRIGHT_LINE_RE);
   if (lineMatch) {
      best = Math.max(best, indexAfterLine(lineMatch[0], source));
   }

   return best;
}

/**
 * Directory visitor that generates module-level header comments using an LLM.
 * Priority: EVisitorPriority.kFirst — runs before the C4 diagram visitor so that
 * headers are up-to-date when diagrams are built.
 *
 * For each .ts/.tsx file it:
 *   1. Reads the file.
 *   2. Checks for an existing StrongAI sentinel block and its embedded date.
 *   3. If the header is absent or stale (older than the configured time window),
 *      calls the LLM to generate a new comment and rewrites the file.
 *   4. If the header is fresh, skips the file.
 */
export class ModuleHeaderVisitor implements IDirectoryVisitor {
   readonly priority = EVisitorPriority.kFirst;
   readonly fileSpecs = ['*.ts', '*.tsx'];

   /**
    * @param fileReader - IFileReader implementation (inject mock for tests)
    * @param fileWriter - IFileWriter implementation (inject mock for tests)
    * @param chatDriver - IChatDriver implementation (inject mock for tests)
    * @param promptRepo - IPromptRepository implementation (inject mock for tests)
    */
   constructor(
      private readonly fileReader: IFileReader,
      private readonly fileWriter: IFileWriter,
      private readonly chatDriver: IChatDriver,
      private readonly promptRepo: IPromptRepository
   ) {}

   async visit(directoryPath: string, filePaths: string[], options: IDocGenOptions): Promise<void> {
      for (const filePath of filePaths) {
         await this.processFile(filePath, options);
      }
   }

   /**
    * Processes a single file: check staleness, call LLM if needed, rewrite file.
    */
   private async processFile(filePath: string, options: IDocGenOptions): Promise<void> {
      const source = await this.fileReader.readFile(filePath);
      const headerDate = this.extractHeaderDate(source);

      if (!this.isStale(headerDate, options)) {
         // Header is present and fresh — skip
         return;
      }

      // Get the prompt
      const prompt = this.promptRepo.getPrompt(moduleHeaderCommentPromptId);
      if (!prompt) {
         throw new InvalidOperationError(`Prompt not found: ${moduleHeaderCommentPromptId}`);
      }

      // Call the LLM
      const systemPrompt = this.promptRepo.expandSystemPrompt(prompt, {});
      const userPrompt   = this.promptRepo.expandUserPrompt(prompt, {
         moduleSource: source,
         wordCount: String(MODULE_COMMENT_WORD_COUNT)
      });
      const generatedComment = await this.chatDriver.getModelResponse(
         systemPrompt,
         userPrompt,
         EVerbosity.kMedium
      );

      // Build and write the updated file
      const stripped = this.stripGeneratedHeader(source);
      const newHeader = this.buildNewHeader(generatedComment, options.jobStartedAt);
      const insertPoint = findInsertionPoint(stripped);
      // Add blank line before block when inserting after prior content, to visually separate comments
      const separator = insertPoint > 0 ? '\n' : '';
      const updatedSource = stripped.substring(0, insertPoint) + separator + newHeader + stripped.substring(insertPoint);
      await this.fileWriter.writeFile(filePath, updatedSource);
   }

   /**
    * Returns true if the header is absent or older than the configured time window.
    * @param headerDate - Parsed date from the existing sentinel, or null if absent/malformed
    * @param options - Job options containing jobStartedAt and timeWindow
    */
   isStale(headerDate: Date | null, options: IDocGenOptions): boolean {
      if (headerDate === null) return true;
      const ageMs = options.jobStartedAt.getTime() - headerDate.getTime();
      const thresholdMs = TIME_WINDOW_DAYS[options.timeWindow] * MS_PER_DAY;
      return ageMs > thresholdMs;
   }

   /**
    * Extracts the embedded date from the StrongAI sentinel opening.
    * Returns null if no sentinel is present or the date is malformed.
    * Checks line-start first, then flexible (handles merged sentinels).
    */
   extractHeaderDate(source: string): Date | null {
      let match = SENTINEL_OPEN_RE.exec(source);
      if (!match) match = SENTINEL_OPEN_FLEXIBLE_RE.exec(source);
      if (!match) return null;
      return parseDateYYYYMMDD(match[1]);
   }

   /**
    * Removes all StrongAI generated header blocks from source.
    * Handles merged sentinels by also removing the preceding JSDoc close when needed.
    * Loops to remove duplicate blocks.
    */
   stripGeneratedHeader(source: string): string {
      let result = source;
      const re = new RegExp(SENTINEL_OPEN_FLEXIBLE_RE.source, 'g');
      let openMatch: RegExpExecArray | null;
      while ((openMatch = re.exec(result)) !== null) {
         const sentinelStart = openMatch.index;
         const closeIndex = result.indexOf(SENTINEL_CLOSE, sentinelStart);
         if (closeIndex === -1) break;

         const afterClose = result.indexOf('\n', closeIndex + SENTINEL_CLOSE.length);
         const endIndex = afterClose === -1 ? result.length : afterClose + 1;

         // If sentinel is merged with JSDoc (e.g. */// ===Start...), remove from */ to fix the JSDoc
         const lineStart = result.lastIndexOf('\n', sentinelStart - 1) + 1;
         const lineBeforeSentinel = result.substring(lineStart, sentinelStart);
         const mergedMatch = /(\*\/)\s*$/.exec(lineBeforeSentinel);
         const removeFrom = mergedMatch ? lineStart + mergedMatch.index : sentinelStart;

         result = result.substring(0, removeFrom) + result.substring(endIndex);
         re.lastIndex = 0; // Reset to find next block in modified string
      }
      return result;
   }

   /**
    * Wraps the LLM-generated plain-text comment in sentinel markers, with each
    * line prefixed by `// `.
    */
   buildNewHeader(generatedComment: string, jobStartedAt: Date): string {
      const dateStr   = formatDateYYYYMMDD(jobStartedAt);
      const openLine  = `${SENTINEL_OPEN_PREFIX}${dateStr}${SENTINEL_OPEN_SUFFIX}`;
      const closeLine = SENTINEL_CLOSE;

      // Prefix every line of the generated comment with `// `
      const commentLines = generatedComment
         .split('\n')
         .map(line => `// ${line}`)
         .join('\n');

      return `${openLine}\n${commentLines}\n${closeLine}\n\n`;
   }
}
