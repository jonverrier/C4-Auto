/**
 * @module DesignContextUtils
 * Locates and loads human-authored design intent documents for rollup context.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import * as path from 'path';
import { IFileReader } from './DocGenTypes';

/** Basenames checked for human-authored design intent near the scan root. */
export const DEFAULT_DESIGN_CANDIDATES: readonly string[] = [
   'Design.md',
   'DESIGN.md'
];

/** Loaded design document used as read-only rollup prompt context. */
export interface IDesignContext {
   absolutePath: string;
   relativePath: string;
   content: string;
   modifiedAt: Date | null;
}

/**
 * Builds absolute paths to check for a design document.
 * When explicitDesignFile is set, only that path is checked (relative to rootDir unless absolute).
 * Otherwise checks Design.md and DESIGN.md in rootDir and its parent directory.
 * @param rootDir - Scan root directory
 * @param explicitDesignFile - Optional explicit design file path
 */
export function buildDesignFileCandidates(rootDir: string, explicitDesignFile?: string): string[] {
   if (explicitDesignFile) {
      const resolved = path.isAbsolute(explicitDesignFile)
         ? explicitDesignFile
         : path.join(rootDir, explicitDesignFile);
      return [path.resolve(resolved)];
   }

   const resolvedRoot = path.resolve(rootDir);
   const candidates: string[] = [];
   for (const name of DEFAULT_DESIGN_CANDIDATES) {
      candidates.push(path.join(resolvedRoot, name));
   }

   const parentDir = path.dirname(resolvedRoot);
   if (parentDir !== resolvedRoot) {
      for (const name of DEFAULT_DESIGN_CANDIDATES) {
         candidates.push(path.join(parentDir, name));
      }
   }

   return candidates;
}

/**
 * Formats loaded design content for injection into rollup prompts.
 * @param design - Loaded design context, or null when absent
 */
export function formatDesignContextForPrompt(design: IDesignContext | null): string {
   if (!design) {
      return '';
   }
   return `## ${design.relativePath}\n${design.content}`;
}

/**
 * Loads the first available design document from candidate paths.
 * Design files are read-only inputs and are never modified by callers.
 * @param fileReader - IFileReader implementation
 * @param rootDir - Scan root directory
 * @param explicitDesignFile - Optional explicit design file path
 * @param getModifiedTime - Optional callback returning file mtime for staleness checks
 */
export async function loadDesignContext(
   fileReader: IFileReader,
   rootDir: string,
   explicitDesignFile?: string,
   getModifiedTime?: (filePath: string) => Promise<Date | null>
): Promise<IDesignContext | null> {
   const resolvedRoot = path.resolve(rootDir);

   for (const candidatePath of buildDesignFileCandidates(rootDir, explicitDesignFile)) {
      try {
         const content = await fileReader.readFile(candidatePath);
         const modifiedAt = getModifiedTime
            ? await getModifiedTime(candidatePath)
            : null;
         const relativePath = path.relative(path.dirname(resolvedRoot), candidatePath).replace(/\\/g, '/');

         return {
            absolutePath: candidatePath,
            relativePath,
            content,
            modifiedAt
         };
      } catch {
         continue;
      }
   }

   return null;
}
