/**
 * @module DocumentationGenerator.integration.test
 * Integration tests for the documentation generator pipeline.
 * Uses real PromptInMemoryRepository loaded from Prompts.json but mocks
 * all file I/O and LLM calls — no real filesystem or network access.
 * Uses path.join throughout so tests run correctly on both Unix and Windows.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import sinon from 'sinon';
import * as nodePath from 'path';

import { PromptInMemoryRepository } from '@jonverrier/prompt-repository';
import type { IPrompt, IChatDriver } from '@jonverrier/prompt-repository';

import { ModuleHeaderVisitor } from '../src/ModuleHeaderVisitor';
import { C4DiagramVisitor } from '../src/C4DiagramVisitor';
import { DirectoryTreeTraverser } from '../src/DirectoryTreeTraverser';
import {
   IFileReader,
   IFileWriter,
   IDirectoryReader,
   IFileFilter,
   IDocGenOptions,
   ETimeWindow,
   EC4DiagramType
} from '../src/DocGenTypes';
import { makeTestDocGenOptions } from './testDocGenOptions';

import typedPrompts from '../src/Prompts.json';

// ---------------------------------------------------------------------------
// Platform-safe fake root directory
// ---------------------------------------------------------------------------

const FAKE_ROOT = nodePath.resolve('fakedir');

// ---------------------------------------------------------------------------
// Representative TypeScript file content strings (no real files read)
// ---------------------------------------------------------------------------

const UI_SOURCE = `// Copyright (c) 2025, 2026 Jon Verrier
import React from 'react';
export interface IUserProfile { userId: string; displayName: string; }
export function UserProfileCard({ profile }: { profile: IUserProfile }) {
   return React.createElement('div', null, profile.displayName);
}`;

const SERVICE_SOURCE = `// Copyright (c) 2025, 2026 Jon Verrier
export interface IWorkout { workoutId: string; title: string; }
export class WorkoutService {
   async getWorkout(id: string): Promise<IWorkout> { throw new Error('nyi'); }
}`;

const REPO_SOURCE = `// Copyright (c) 2025, 2026 Jon Verrier
export interface IExercise { exerciseId: string; name: string; }
export class ExerciseRepository {
   async findById(id: string): Promise<IExercise | null> { return null; }
}`;

// Use path.join so keys match what the traverser will produce on any OS
const SYNTHETIC_FILES: Record<string, string> = {
   [nodePath.join(FAKE_ROOT, 'UserProfileComponent.tsx')]: UI_SOURCE,
   [nodePath.join(FAKE_ROOT, 'WorkoutService.ts')]:        SERVICE_SOURCE,
   [nodePath.join(FAKE_ROOT, 'ExerciseRepository.ts')]:    REPO_SOURCE
};

const SYNTHETIC_FILE_NAMES = ['UserProfileComponent.tsx', 'WorkoutService.ts', 'ExerciseRepository.ts'];

// ---------------------------------------------------------------------------
// Fake LLM responses
// ---------------------------------------------------------------------------

const FAKE_HEADER_COMMENT = 'This module exports a user-facing React component.';
const FAKE_DIAGRAM = `Overview section here.

\`\`\`mermaid
C4Component
   title Fake C4 Diagram
   Container(a, "A", "TypeScript", "does stuff")
\`\`\`

Key components: UserProfileCard, WorkoutService, ExerciseRepository.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(overrides?: Partial<IDocGenOptions>): IDocGenOptions {
   return makeTestDocGenOptions({
      rootDir: FAKE_ROOT,
      fileSpecs: ['*.ts', '*.tsx'],
      timeWindow: ETimeWindow.kOneWeek,
      c4DiagramTypes: [EC4DiagramType.kComponent],
      ...overrides
   });
}

function makeChatDriver(headerResponse = FAKE_HEADER_COMMENT, diagramResponse = FAKE_DIAGRAM): IChatDriver {
   let callCount = 0;
   return {
      getModelResponse: sinon.stub().callsFake(async () => {
         callCount++;
         // First N calls (one per source file) → header comment; subsequent → diagram
         return callCount <= SYNTHETIC_FILE_NAMES.length ? headerResponse : diagramResponse;
      }),
      getStreamedModelResponse:                sinon.stub(),
      getModelResponseWithForcedTools:         sinon.stub(),
      getStreamedModelResponseWithForcedTools: sinon.stub(),
      getConstrainedModelResponse:             sinon.stub()
   } as unknown as IChatDriver;
}

/** File reader backed by SYNTHETIC_FILES; throws ENOENT for anything else. */
function makeSyntheticFileReader(extra: Record<string, string> = {}): IFileReader {
   const allFiles = { ...SYNTHETIC_FILES, ...extra };
   return {
      readFile: sinon.stub().callsFake(async (filePath: string) => {
         if (filePath in allFiles) return allFiles[filePath];
         const err: NodeJS.ErrnoException = new Error(`ENOENT: ${filePath}`);
         err.code = 'ENOENT';
         throw err;
      })
   };
}

function makeFileWriter(): sinon.SinonStubbedInstance<IFileWriter> & IFileWriter {
   return { writeFile: sinon.stub().resolves() } as unknown as sinon.SinonStubbedInstance<IFileWriter> & IFileWriter;
}

/** Fake directory reader that returns the synthetic files under FAKE_ROOT. */
function makeDirectoryReader(): IDirectoryReader {
   return {
      listDirectory: sinon.stub().callsFake(async (dirPath: string) => {
         if (dirPath === FAKE_ROOT) return SYNTHETIC_FILE_NAMES;
         return [];
      }),
      isDirectory: sinon.stub().callsFake(async (itemPath: string) => {
         return itemPath === FAKE_ROOT;
      })
   };
}

/** File filter that matches .ts and .tsx by extension. */
const tsFilter: IFileFilter = {
   matches: (_filename: string) => _filename.endsWith('.ts') || _filename.endsWith('.tsx')
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DocumentationGenerator integration', () => {
   afterEach(() => sinon.restore());

   it('uses real Prompts.json to expand user prompt (confirms prompt schema is valid)', () => {
      const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
      const headerPromptId = 'a1d4e7f2-3b8c-4f0e-9d2a-5c6b7e8f1a2b';
      const prompt = promptRepo.getPrompt(headerPromptId);
      expect(prompt).not.toBeUndefined();
      const expanded = promptRepo.expandUserPrompt(prompt!, {
         moduleSource: 'export const x = 1;',
         wordCount: '150'
      });
      expect(expanded).toContain('export const x = 1;');
      expect(expanded).toContain('150');
   });

   // -------------------------------------------------------------------------
   describe('ModuleHeaderVisitor with real prompts', () => {
      it('writes sentinel markers into every file that has no existing header', async () => {
         const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer     = makeFileWriter();
         const driver     = makeChatDriver();
         const visitor    = new ModuleHeaderVisitor(
            makeSyntheticFileReader(), writer, driver, promptRepo
         );
         const filePaths  = Object.keys(SYNTHETIC_FILES);

         await visitor.visit(FAKE_ROOT, filePaths, makeOptions());

         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(filePaths.length);

         const writtenContents: string[] = (writer.writeFile as sinon.SinonStub).args
            .map((a: unknown[]) => a[1] as string);

         for (const content of writtenContents) {
            expect(content).toContain('===Start StrongAI Generated Comment');
            expect(content).toContain('===End StrongAI Generated Comment===');
         }
      });

      it('embeds a valid YYYYMMDD date in each sentinel', async () => {
         const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer     = makeFileWriter();
         const driver     = makeChatDriver();
         const visitor    = new ModuleHeaderVisitor(
            makeSyntheticFileReader(), writer, driver, promptRepo
         );
         await visitor.visit(FAKE_ROOT, Object.keys(SYNTHETIC_FILES), makeOptions());

         const writtenContents: string[] = (writer.writeFile as sinon.SinonStub).args
            .map((a: unknown[]) => a[1] as string);

         for (const content of writtenContents) {
            const match = content.match(/===Start StrongAI Generated Comment \((\d{8})\)===/);
            expect(match).not.toBeNull();
            expect(match![1]).toBe('20250115');
         }
      });

      it('skips files whose headers are within the time window', async () => {
         const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer     = makeFileWriter();
         const driver     = makeChatDriver();

         const freshSource = `// ===Start StrongAI Generated Comment (20250112)===\n// Fresh comment.\n// ===End StrongAI Generated Comment===\n${UI_SOURCE}`;
         const reader: IFileReader = {
            readFile: sinon.stub().resolves(freshSource)
         };
         const visitor = new ModuleHeaderVisitor(reader, writer, driver, promptRepo);

         await visitor.visit(FAKE_ROOT, [nodePath.join(FAKE_ROOT, 'UserProfileComponent.tsx')], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(0);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(0);
      });
   });

   // -------------------------------------------------------------------------
   describe('C4DiagramVisitor with real prompts', () => {
      it('writes a README containing a Mermaid code fence', async () => {
         const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer     = makeFileWriter();
         const driver     = { getModelResponse: sinon.stub().resolves(FAKE_DIAGRAM) } as unknown as IChatDriver;
         const visitor    = new C4DiagramVisitor(
            makeSyntheticFileReader(), writer, driver, promptRepo, [EC4DiagramType.kComponent]
         );

         await visitor.visit(FAKE_ROOT, Object.keys(SYNTHETIC_FILES), makeOptions());

         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(1);
         const [outPath, content] = (writer.writeFile as sinon.SinonStub).firstCall.args as [string, string];
         expect(outPath).toContain('README.StrongAI.Component.md');
         expect(content).toContain('```mermaid');
         expect(content).toContain('<!-- Generated by StrongAIAutoDoc 20250115 -->');
      });

      it('writes an overview section and a key-components section', async () => {
         const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer     = makeFileWriter();
         const driver     = { getModelResponse: sinon.stub().resolves(FAKE_DIAGRAM) } as unknown as IChatDriver;
         const visitor    = new C4DiagramVisitor(
            makeSyntheticFileReader(), writer, driver, promptRepo, [EC4DiagramType.kComponent]
         );

         await visitor.visit(FAKE_ROOT, Object.keys(SYNTHETIC_FILES), makeOptions());

         const content = (writer.writeFile as sinon.SinonStub).firstCall.args[1] as string;
         expect(content).toContain('Overview section here.');
         expect(content).toContain('Key components:');
      });
   });

   // -------------------------------------------------------------------------
   describe('Full pipeline (traverser + both visitors)', () => {
      it('runs header visitor before C4 visitor and writes all outputs', async () => {
         const promptRepo   = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
         const writer       = makeFileWriter();
         const callOrder: string[] = [];

         const headerDriver = {
            getModelResponse: sinon.stub().callsFake(async () => {
               callOrder.push('header');
               return FAKE_HEADER_COMMENT;
            })
         } as unknown as IChatDriver;

         const diagramDriver = {
            getModelResponse: sinon.stub().callsFake(async () => {
               callOrder.push('diagram');
               return FAKE_DIAGRAM;
            })
         } as unknown as IChatDriver;

         // The header visitor writes files; C4 visitor reads back those (now-modified) files.
         // Use a reader backed by SYNTHETIC_FILES for both visitors.
         const reader = makeSyntheticFileReader();

         const headerVisitor = new ModuleHeaderVisitor(reader, writer, headerDriver, promptRepo);
         const c4Visitor     = new C4DiagramVisitor(reader, writer, diagramDriver, promptRepo, [EC4DiagramType.kComponent]);

         const traverser = new DirectoryTreeTraverser(
            [headerVisitor, c4Visitor],
            makeDirectoryReader(),
            tsFilter
         );

         await traverser.traverse(makeOptions());

         // All header calls should come before any diagram call
         const firstDiagram = callOrder.indexOf('diagram');
         const lastHeader   = callOrder.lastIndexOf('header');
         expect(firstDiagram).toBeGreaterThan(lastHeader);

         // Total writes: 3 source files + 1 README
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(4);
      });
   });
});
