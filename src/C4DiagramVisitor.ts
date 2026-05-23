/**
 * @module C4DiagramVisitor
 * Directory visitor that generates C4 architecture diagrams in Mermaid format.
 * Runs after ModuleHeaderVisitor (priority kSecond) so that file headers are
 * up-to-date before being used as input to the diagram prompt.
 * Writes README.StrongAI.Component.md and/or README.StrongAI.Context.md into
 * each visited directory, scaling the word counts non-linearly with file count.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// Directory visitor that generates C4 architecture diagrams in Mermaid format. Runs after ModuleHeaderVisitor so file headers are current before diagram generation. Writes README.StrongAI.Component.md and/or README.StrongAI.Context.md per directory.
//
// Main export: C4DiagramVisitor implements IDirectoryVisitor with priority kSecond. visit collects header blocks from all .ts/.tsx files, computes scaled word counts, and generates each requested diagram type (Component, Context) via LLM prompts. Uses staleness check (embedded datestamp) to skip fresh outputs.
//
// Key methods: collectHeaders (extracts StrongAI sentinel blocks or full source), generateDiagram (calls chat driver, writes README), extractHeaderBlock, computeWordCounts, isOutputStale.
// ===End StrongAI Generated Comment===

import * as path from 'path';
import {
   IPrompt,
   EModel,
   EModelProvider,
   EVerbosity,
   IChatDriver,
   IPromptRepository,
   InvalidOperationError
} from '@jonverrier/prompt-repository';

import {
   EC4DiagramType,
   EVisitorPriority,
   IDocGenOptions,
   IFileReader,
   IFileWriter,
   IDirectoryVisitor
} from './DocGenTypes';

import { c4ComponentDiagramPromptId, c4ContextDiagramPromptId } from './PromptIds';
import {
   getC4OutputFilename,
   buildReadmeDatestamp,
   isReadmeOutputStale
} from './C4ReadmeUtils';

// Word-count scaling constants for section lengths.
const C4_INTRO_BASE_WORD_COUNT  = 60;
const C4_DETAIL_BASE_WORD_COUNT = 80;
const C4_WORDS_PER_ROOT_FILE    = 20;
const C4_INTRO_FRACTION         = 0.4;  // 40% intro, 60% detail

// Sentinel used to extract the header block written by ModuleHeaderVisitor.
const SENTINEL_OPEN_RE  = /\/\/ ===Start StrongAI Generated Comment \(\d{8}\)===/;
const SENTINEL_CLOSE    = '// ===End StrongAI Generated Comment===';

// Maps EC4DiagramType to its prompt ID.
const C4_PROMPT_IDS: Record<EC4DiagramType, string> = {
   [EC4DiagramType.kComponent]: c4ComponentDiagramPromptId,
   [EC4DiagramType.kContext]:   c4ContextDiagramPromptId,
};

/**
 * Directory visitor that generates C4 architecture diagram Markdown files.
 * Priority: EVisitorPriority.kSecond — runs after ModuleHeaderVisitor.
 */
export class C4DiagramVisitor implements IDirectoryVisitor {
   readonly priority = EVisitorPriority.kSecond;
   readonly fileSpecs = ['*.ts', '*.tsx'];

   /**
    * @param fileReader - IFileReader implementation (inject mock for tests)
    * @param fileWriter - IFileWriter implementation (inject mock for tests)
    * @param chatDriver - IChatDriver implementation (inject mock for tests)
    * @param promptRepo - IPromptRepository implementation (inject mock for tests)
    * @param diagramTypes - Which diagram types to generate
    */
   constructor(
      private readonly fileReader: IFileReader,
      private readonly fileWriter: IFileWriter,
      private readonly chatDriver: IChatDriver,
      private readonly promptRepo: IPromptRepository,
      private readonly diagramTypes: EC4DiagramType[]
   ) {}

   async visit(directoryPath: string, filePaths: string[], options: IDocGenOptions): Promise<void> {
      if (options.rollup && options.hasSubdirectorySources) {
         const normalizedRoot = path.resolve(options.rootDir);
         const normalizedDir  = path.resolve(directoryPath);
         if (normalizedDir === normalizedRoot) {
            return;
         }
      }

      // Collect the header blocks (or full source) for all files in this directory.
      const moduleHeaders = await this.collectHeaders(filePaths);
      const { introWords, detailWords } = this.computeWordCounts(filePaths.length);

      // Generate each requested diagram type sequentially.
      for (const diagramType of this.diagramTypes) {
         await this.generateDiagram(
            directoryPath,
            diagramType,
            moduleHeaders,
            introWords,
            detailWords,
            options
         );
      }
   }

   /**
    * Reads each file and extracts its StrongAI header block (or falls back to full source).
    * Returns a single concatenated string used as the LLM prompt input.
    */
   private async collectHeaders(filePaths: string[]): Promise<string> {
      const parts: string[] = [];
      for (const filePath of filePaths) {
         const source = await this.fileReader.readFile(filePath);
         const header = this.extractHeaderBlock(source);
         const label  = path.basename(filePath);
         parts.push(`### ${label}\n${header}`);
      }
      return parts.join('\n\n');
   }

   /**
    * Generates and writes a single C4 diagram type for a directory.
    */
   private async generateDiagram(
      directoryPath: string,
      diagramType: EC4DiagramType,
      moduleHeaders: string,
      introWords: number,
      detailWords: number,
      options: IDocGenOptions
   ): Promise<void> {
      const outputFilename = getC4OutputFilename(options, diagramType);
      const outputPath     = path.join(directoryPath, outputFilename);

      // Check if the existing output file is still fresh.
      let existingContent: string | null = null;
      try {
         existingContent = await this.fileReader.readFile(outputPath);
      } catch {
         // File does not exist yet — need to generate.
      }

      if (!isReadmeOutputStale(existingContent, options)) {
         return; // Fresh — skip generation.
      }

      // Look up the prompt.
      const promptId = C4_PROMPT_IDS[diagramType];
      const prompt   = this.promptRepo.getPrompt(promptId);
      if (!prompt) {
         throw new InvalidOperationError(`Prompt not found: ${promptId}`);
      }

      // Build the LLM call.
      const systemPrompt = this.promptRepo.expandSystemPrompt(prompt, {});
      const userPrompt   = this.promptRepo.expandUserPrompt(prompt, {
         moduleHeaders,
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

   /**
    * Extracts the StrongAI generated header block from a source file.
    * Falls back to the full source if no sentinel block is present.
    */
   extractHeaderBlock(source: string): string {
      const openMatch = SENTINEL_OPEN_RE.exec(source);
      if (!openMatch) return source;

      const openIndex  = source.indexOf(openMatch[0]);
      const closeIndex = source.indexOf(SENTINEL_CLOSE, openIndex);
      if (closeIndex === -1) return source;

      return source.substring(openIndex, closeIndex + SENTINEL_CLOSE.length);
   }

   /**
    * Computes scaled intro and detail word counts based on number of files.
    * Uses a square-root curve so larger directories get longer docs, but not linearly.
    */
   computeWordCounts(fileCount: number): { introWords: number; detailWords: number } {
      const totalWords   = C4_INTRO_BASE_WORD_COUNT + C4_DETAIL_BASE_WORD_COUNT
                         + Math.floor(Math.sqrt(fileCount) * C4_WORDS_PER_ROOT_FILE);
      const introWords   = Math.floor(totalWords * C4_INTRO_FRACTION);
      const detailWords  = totalWords - introWords;
      return { introWords, detailWords };
   }

   /**
    * Returns the output filename for a given C4 diagram type.
    */
   outputFilename(type: EC4DiagramType, options: IDocGenOptions): string {
      return getC4OutputFilename(options, type);
   }

   /**
    * Returns true if the existing README content is absent or older than the time window.
    */
   isOutputStale(existingContent: string | null, options: IDocGenOptions): boolean {
      return isReadmeOutputStale(existingContent, options);
   }
}
