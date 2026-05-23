/**
 * @module RollupC4Visitor
 * Directory visitor that accumulates per-directory StrongAI C4 README files during
 * traversal and synthesizes higher-level summaries at the scan root in finalize().
 */
// Copyright (c) 2025, 2026 Jon Verrier

import * as path from 'path';
import {
   IChatDriver,
   IPromptRepository,
   InvalidOperationError,
   EVerbosity
} from '@jonverrier/prompt-repository';

import {
   EC4DiagramType,
   EVisitorPriority,
   IDocGenOptions,
   IDirectoryVisitor,
   IFileReader,
   IFileWriter
} from './DocGenTypes';
import {
   C4_OUTPUT_FILES,
   buildReadmeDatestamp,
   isReadmeOutputStale
} from './C4ReadmeUtils';
import { c4ComponentRollupPromptId, c4ContextRollupPromptId } from './PromptIds';

/** Base word counts for rollup overview and detail sections. */
const ROLLUP_INTRO_BASE_WORD_COUNT  = 80;
const ROLLUP_DETAIL_BASE_WORD_COUNT = 120;
const ROLLUP_WORDS_PER_SUBDIR       = 25;
const ROLLUP_INTRO_FRACTION         = 0.4;

/** Maps EC4DiagramType to its rollup prompt ID. */
const ROLLUP_PROMPT_IDS: Record<EC4DiagramType, string> = {
   [EC4DiagramType.kComponent]: c4ComponentRollupPromptId,
   [EC4DiagramType.kContext]:   c4ContextRollupPromptId,
};

/** One subdirectory README collected during traversal. */
interface IAccumulatedReadme {
   relativeDir: string;
   diagramType: EC4DiagramType;
   content: string;
}

/**
 * Accumulates child-directory README.StrongAI.*.md files and writes rollup summaries
 * at the scan root when finalize() runs.
 */
export class RollupC4Visitor implements IDirectoryVisitor {
   readonly priority = EVisitorPriority.kThird;
   readonly fileSpecs: string[];

   private readonly accumulated: IAccumulatedReadme[] = [];

   /**
    * @param fileReader - IFileReader implementation
    * @param fileWriter - IFileWriter implementation
    * @param chatDriver - IChatDriver implementation
    * @param promptRepo - IPromptRepository implementation
    * @param diagramTypes - Which diagram types to roll up
    * @param fileSpecs - Source file globs shared with other visitors
    */
   constructor(
      private readonly fileReader: IFileReader,
      private readonly fileWriter: IFileWriter,
      private readonly chatDriver: IChatDriver,
      private readonly promptRepo: IPromptRepository,
      private readonly diagramTypes: EC4DiagramType[],
      fileSpecs: string[]
   ) {
      this.fileSpecs = fileSpecs;
   }

   async visit(directoryPath: string, _filePaths: string[], options: IDocGenOptions): Promise<void> {
      const normalizedRoot = path.resolve(options.rootDir);
      const normalizedDir  = path.resolve(directoryPath);
      if (normalizedDir === normalizedRoot) {
         return;
      }

      const relativeDir = path.relative(normalizedRoot, normalizedDir);
      for (const diagramType of this.diagramTypes) {
         const readmePath = path.join(directoryPath, C4_OUTPUT_FILES[diagramType]);
         let content: string | null = null;
         try {
            content = await this.fileReader.readFile(readmePath);
         } catch {
            continue;
         }
         this.accumulated.push({ relativeDir, diagramType, content });
      }
   }

   async finalize(options: IDocGenOptions): Promise<void> {
      if (this.accumulated.length === 0) {
         console.log('Rollup skipped: no subdirectory README.StrongAI.*.md files found.');
         return;
      }

      for (const diagramType of this.diagramTypes) {
         await this.generateRollup(options.rootDir, diagramType, options);
      }
   }

   /**
    * Computes scaled intro and detail word counts based on subdirectory count.
    * @param subdirCount - Number of subdirectory README inputs
    * @returns Intro and detail word targets
    */
   computeWordCounts(subdirCount: number): { introWords: number; detailWords: number } {
      const totalWords  = ROLLUP_INTRO_BASE_WORD_COUNT + ROLLUP_DETAIL_BASE_WORD_COUNT
                        + Math.floor(Math.sqrt(subdirCount) * ROLLUP_WORDS_PER_SUBDIR);
      const introWords  = Math.floor(totalWords * ROLLUP_INTRO_FRACTION);
      const detailWords = totalWords - introWords;
      return { introWords, detailWords };
   }

   private async generateRollup(
      rootDir: string,
      diagramType: EC4DiagramType,
      options: IDocGenOptions
   ): Promise<void> {
      const entries = this.accumulated.filter(entry => entry.diagramType === diagramType);
      if (entries.length === 0) {
         return;
      }

      const outputPath = path.join(rootDir, C4_OUTPUT_FILES[diagramType]);
      let existingContent: string | null = null;
      try {
         existingContent = await this.fileReader.readFile(outputPath);
      } catch {
         // File does not exist yet.
      }

      if (!isReadmeOutputStale(existingContent, options)) {
         return;
      }

      const promptId = ROLLUP_PROMPT_IDS[diagramType];
      const prompt   = this.promptRepo.getPrompt(promptId);
      if (!prompt) {
         throw new InvalidOperationError(`Prompt not found: ${promptId}`);
      }

      const subdirectorySummaries = entries
         .map(entry => `## ${entry.relativeDir}\n${entry.content}`)
         .join('\n\n');
      const { introWords, detailWords } = this.computeWordCounts(entries.length);

      const systemPrompt = this.promptRepo.expandSystemPrompt(prompt, {});
      const userPrompt   = this.promptRepo.expandUserPrompt(prompt, {
         subdirectorySummaries,
         introWordCount: String(introWords),
         detailWordCount: String(detailWords)
      });
      const generated = await this.chatDriver.getModelResponse(
         systemPrompt,
         userPrompt,
         EVerbosity.kMedium
      );

      await this.fileWriter.writeFile(outputPath, buildReadmeDatestamp(options.jobStartedAt) + generated);
   }
}
