/**
 * @module DirectoryTreeTraverser
 * Depth-first directory tree traverser using the Visitor pattern.
 * For each directory containing files that match a visitor's file specs,
 * registered visitors are called in priority order.
 * Production implementations of IDirectoryReader and IFileFilter are provided here.
 * Inject alternatives for testing.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// Depth-first directory tree traverser using the Visitor pattern. Scans from a root directory, finds files matching visitor-defined glob patterns, and dispatches them to visitors in ascending priority.
//
// Main exports: DirectoryTreeTraverser orchestrates traversal; NodeDirectoryReader (IDirectoryReader) lists entries via fs/promises; MinimatchFileFilter (IFileFilter) matches filenames against globs. Skips node_modules, dist, .git, etc.
// ===End StrongAI Generated Comment===

import * as path from 'path';
import * as fs from 'fs/promises';
import { minimatch } from 'minimatch';
import { InvalidParameterError } from '@jonverrier/prompt-repository';
import {
   IDocGenOptions,
   IDirectoryReader,
   IFileFilter,
   IDirectoryVisitor
} from './DocGenTypes';

// Directories that are always skipped during traversal.
const EXCLUDED_DIRS: ReadonlyArray<string> = [
   'node_modules',
   'dist',
   '.git',
   '.nyc_output',
   'coverage'
];

/**
 * Production implementation of IDirectoryReader using Node.js fs/promises.
 */
export class NodeDirectoryReader implements IDirectoryReader {
   async listDirectory(dirPath: string): Promise<string[]> {
      return fs.readdir(dirPath);
   }

   async isDirectory(itemPath: string): Promise<boolean> {
      const stat = await fs.stat(itemPath);
      return stat.isDirectory();
   }
}

/**
 * Production implementation of IFileFilter using the minimatch glob library.
 */
export class MinimatchFileFilter implements IFileFilter {
   matches(filename: string, specs: string[]): boolean {
      return specs.some(spec => minimatch(filename, spec));
   }
}

/**
 * Traverses a directory tree depth-first, dispatching matching files to registered
 * IDirectoryVisitor implementations in ascending priority order.
 *
 * @example
 * ```typescript
 * const traverser = new DirectoryTreeTraverser(visitors, new NodeDirectoryReader(), new MinimatchFileFilter());
 * await traverser.traverse(options);
 * ```
 */
export class DirectoryTreeTraverser {
   private readonly sortedVisitors: IDirectoryVisitor[];

   /**
    * @param visitors - Array of visitors to call for each matching directory
    * @param directoryReader - Implementation of IDirectoryReader (inject mock for tests)
    * @param fileFilter - Implementation of IFileFilter (inject mock for tests)
    */
   constructor(
      visitors: IDirectoryVisitor[],
      private readonly directoryReader: IDirectoryReader,
      private readonly fileFilter: IFileFilter
   ) {
      if (!visitors || visitors.length === 0) {
         throw new InvalidParameterError('At least one visitor must be provided to DirectoryTreeTraverser');
      }
      // Sort once at construction time, ascending by priority value
      this.sortedVisitors = [...visitors].sort((a, b) => a.priority - b.priority);
   }

   /**
    * Starts the depth-first traversal from options.rootDir.
    * @param options - The parsed doc-gen options including rootDir and jobStartedAt
    */
   async traverse(options: IDocGenOptions): Promise<void> {
      await this.visitDirectory(options.rootDir, options);
   }

   /**
    * Recursively visits a single directory, then recurses into subdirectories.
    */
   private async visitDirectory(dirPath: string, options: IDocGenOptions): Promise<void> {
      const entries = await this.directoryReader.listDirectory(dirPath);

      // Collect subdirectories and files separately
      const subdirs: string[] = [];
      const files: string[] = [];

      for (const entry of entries) {
         const fullPath = path.join(dirPath, entry);
         const isDir = await this.directoryReader.isDirectory(fullPath);

         if (isDir) {
            if (!EXCLUDED_DIRS.includes(entry)) {
               subdirs.push(entry);
            }
         } else {
            files.push(entry);
         }
      }

      // Call each visitor (already sorted by priority) for this directory
      for (const visitor of this.sortedVisitors) {
         const matchingFiles = files
            .filter(f => this.fileFilter.matches(f, visitor.fileSpecs))
            .map(f => path.join(dirPath, f));

         if (matchingFiles.length > 0) {
            await visitor.visit(dirPath, matchingFiles, options);
         }
      }

      // Recurse into subdirectories (depth-first)
      for (const subdir of subdirs) {
         await this.visitDirectory(path.join(dirPath, subdir), options);
      }
   }
}
