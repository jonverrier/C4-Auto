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
   DRY_RUN_LOG_PREFIX,
   IDocGenOptions,
   IDirectoryVisitor,
   IFileReader,
   IFileWriter
} from './DocGenTypes';
import {
   getC4OutputFilename,
   buildReadmeDatestamp,
   isRollupOutputStale
} from './C4ReadmeUtils';
import { extractModuleHeaderBlock, extractModuleHeaderDate } from './ModuleHeaderExtract';
import { c4ComponentRollupPromptId, c4ContextRollupPromptId } from './PromptIds';
import {
   formatDesignContextForPrompt,
   IDesignContext,
   loadDesignContext
} from './DesignContextUtils';

/** Base word counts for rollup overview and detail sections. */
const ROLLUP_INTRO_BASE_WORD_COUNT  = 80;
const ROLLUP_DETAIL_BASE_WORD_COUNT = 120;
const ROLLUP_WORDS_PER_SUBDIR       = 25;
const ROLLUP_INTRO_FRACTION         = 0.4;

/** Label used for root-level module headers in rollup prompts. */
const ROOT_MODULE_HEADERS_SECTION = '(root)';

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
   private rootFilePaths: string[] = [];

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

   async visit(directoryPath: string, filePaths: string[], options: IDocGenOptions): Promise<void> {
      const normalizedRoot = path.resolve(options.rootDir);
      const normalizedDir  = path.resolve(directoryPath);

      if (normalizedDir === normalizedRoot) {
         this.rootFilePaths = filePaths;
         return;
      }

      const relativeDir = path.relative(normalizedRoot, normalizedDir);
      for (const diagramType of this.diagramTypes) {
         const readmePath = path.join(directoryPath, getC4OutputFilename(options, diagramType));
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

      const { rootModuleHeaders, rootModuleHeaderDates } = await this.collectRootModuleHeaders();
      const designContext = await this.loadDesignContextForRollup(options);

      for (const diagramType of this.diagramTypes) {
         await this.generateRollup(
            options.rootDir,
            diagramType,
            options,
            rootModuleHeaders,
            rootModuleHeaderDates,
            designContext
         );
      }
   }

   /**
    * Computes scaled intro and detail word counts based on input section count.
    * @param inputSectionCount - Number of subdirectory and root input sections
    * @returns Intro and detail word targets
    */
   computeWordCounts(inputSectionCount: number): { introWords: number; detailWords: number } {
      const totalWords  = ROLLUP_INTRO_BASE_WORD_COUNT + ROLLUP_DETAIL_BASE_WORD_COUNT
                        + Math.floor(Math.sqrt(inputSectionCount) * ROLLUP_WORDS_PER_SUBDIR);
      const introWords  = Math.floor(totalWords * ROLLUP_INTRO_FRACTION);
      const detailWords = totalWords - introWords;
      return { introWords, detailWords };
   }

   private async collectRootModuleHeaders(): Promise<{
      rootModuleHeaders: string;
      rootModuleHeaderDates: Date[];
   }> {
      if (this.rootFilePaths.length === 0) {
         return { rootModuleHeaders: '', rootModuleHeaderDates: [] };
      }

      const parts: string[] = [];
      const dates: Date[] = [];

      for (const filePath of this.rootFilePaths) {
         const source = await this.fileReader.readFile(filePath);
         const header = extractModuleHeaderBlock(source);
         const date   = extractModuleHeaderDate(source);
         if (date) {
            dates.push(date);
         }
         parts.push(`### ${path.basename(filePath)}\n${header}`);
      }

      const rootModuleHeaders = parts.length > 0
         ? `## ${ROOT_MODULE_HEADERS_SECTION}\n${parts.join('\n\n')}`
         : '';

      return { rootModuleHeaders, rootModuleHeaderDates: dates };
   }

   private async loadDesignContextForRollup(options: IDocGenOptions): Promise<IDesignContext | null> {
      return loadDesignContext(
         this.fileReader,
         options.rootDir,
         options.designFile,
         this.fileReader.getFileModifiedTime?.bind(this.fileReader)
      );
   }

   private async generateRollup(
      rootDir: string,
      diagramType: EC4DiagramType,
      options: IDocGenOptions,
      rootModuleHeaders: string,
      rootModuleHeaderDates: Date[],
      designContext: IDesignContext | null
   ): Promise<void> {
      const entries = this.accumulated.filter(entry => entry.diagramType === diagramType);
      if (entries.length === 0) {
         return;
      }

      const outputPath = path.join(rootDir, getC4OutputFilename(options, diagramType));
      let existingContent: string | null = null;
      try {
         existingContent = await this.fileReader.readFile(outputPath);
      } catch {
         // File does not exist yet.
      }

      const childContents = entries.map(entry => entry.content);
      const designContextForPrompt = formatDesignContextForPrompt(designContext);
      if (!isRollupOutputStale(
         existingContent,
         childContents,
         rootModuleHeaderDates,
         options,
         designContext?.modifiedAt ?? null
      )) {
         return;
      }

      if (options.dryRun) {
         console.log(`${DRY_RUN_LOG_PREFIX} would write rollup ${outputPath}`);
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
      const inputSectionCount = entries.length
         + (rootModuleHeaders ? 1 : 0)
         + (designContextForPrompt ? 1 : 0);
      const { introWords, detailWords } = this.computeWordCounts(inputSectionCount);

      const systemPrompt = this.promptRepo.expandSystemPrompt(prompt, {});
      const userPrompt   = this.promptRepo.expandUserPrompt(prompt, {
         subdirectorySummaries,
         rootModuleHeaders,
         designContext: designContextForPrompt,
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
