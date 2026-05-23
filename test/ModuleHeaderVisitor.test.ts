/**
 * @module ModuleHeaderVisitor.test
 * Unit tests for ModuleHeaderVisitor. All LLM calls and file I/O are mocked
 * via injected interfaces. No real filesystem or network calls are made.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import sinon from 'sinon';

import { ModuleHeaderVisitor } from '../src/ModuleHeaderVisitor';
import {
   IFileReader,
   IFileWriter,
   IDocGenOptions,
   ETimeWindow,
   EC4DiagramType
} from '../src/DocGenTypes';
import { IChatDriver, IPromptRepository, IPrompt } from '@jonverrier/prompt-repository';
import { moduleHeaderCommentPromptId } from '../src/PromptIds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_COMMENT = 'This module exports a WorkoutService that handles scheduling.';

const SAMPLE_SOURCE = `// Copyright (c) 2025, 2026 Jon Verrier
import { something } from 'somewhere';
export class MyClass {}
`;

function makeSentinelSource(dateStr: string, comment = FAKE_COMMENT): string {
   return [
      `// ===Start StrongAI Generated Comment (${dateStr})===`,
      `// ${comment}`,
      '// ===End StrongAI Generated Comment===',
      SAMPLE_SOURCE
   ].join('\n');
}

function makeOptions(overrides?: Partial<IDocGenOptions>): IDocGenOptions {
   return {
      rootDir: '/root',
      fileSpecs: ['*.ts'],
      timeWindow: ETimeWindow.kOneWeek,
      c4DiagramTypes: [],
      rollup: false,
      hasSubdirectorySources: false,
      jobStartedAt: new Date('2025-01-15'),
      ...overrides
   };
}

function makePromptRepo(): IPromptRepository {
   const fakePrompt: IPrompt = {
      id: moduleHeaderCommentPromptId,
      name: 'ModuleHeaderComment',
      version: '1.0',
      systemPrompt: 'You are a senior engineer.',
      userPrompt: 'Source: {moduleSource} WordCount: {wordCount}',
      userPromptParameters: [
         { name: 'moduleSource', description: '', type: 'kString', required: true },
         { name: 'wordCount',    description: '', type: 'kNumber', required: true }
      ]
   };
   return {
      getPrompt:         sinon.stub().returns(fakePrompt),
      expandSystemPrompt: sinon.stub().returns('You are a senior engineer.'),
      expandUserPrompt:  sinon.stub().returns('Summarise this module.')
   } as unknown as IPromptRepository;
}

function makeChatDriver(returnValue = FAKE_COMMENT): IChatDriver {
   return {
      getModelResponse:                      sinon.stub().resolves(returnValue),
      getStreamedModelResponse:              sinon.stub(),
      getModelResponseWithForcedTools:       sinon.stub(),
      getStreamedModelResponseWithForcedTools: sinon.stub(),
      getConstrainedModelResponse:           sinon.stub()
   } as unknown as IChatDriver;
}

function makeFileReader(source: string): IFileReader {
   return { readFile: sinon.stub().resolves(source) };
}

function makeFileWriter(): sinon.SinonStubbedInstance<IFileWriter> & IFileWriter {
   return { writeFile: sinon.stub().resolves() } as unknown as sinon.SinonStubbedInstance<IFileWriter> & IFileWriter;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ModuleHeaderVisitor', () => {
   afterEach(() => sinon.restore());

   // -------------------------------------------------------------------------
   describe('isStale', () => {
      it('returns true when headerDate is null (no sentinel)', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         expect(visitor.isStale(null, makeOptions())).toBe(true);
      });

      it('returns true when header is older than one week', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // jobStartedAt = 2025-01-15, header = 2025-01-01 → 14 days old > 7
         const old = new Date('2025-01-01');
         expect(visitor.isStale(old, makeOptions({ timeWindow: ETimeWindow.kOneWeek }))).toBe(true);
      });

      it('returns false when header is within one week', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // jobStartedAt = 2025-01-15, header = 2025-01-12 → 3 days old < 7
         const recent = new Date('2025-01-12');
         expect(visitor.isStale(recent, makeOptions({ timeWindow: ETimeWindow.kOneWeek }))).toBe(false);
      });

      it('returns true when header is older than two weeks', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // 20 days old > 14
         const old = new Date('2024-12-26');
         expect(visitor.isStale(old, makeOptions({ timeWindow: ETimeWindow.kTwoWeeks }))).toBe(true);
      });

      it('returns false when header is within two weeks', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // 10 days old < 14
         const recent = new Date('2025-01-05');
         expect(visitor.isStale(recent, makeOptions({ timeWindow: ETimeWindow.kTwoWeeks }))).toBe(false);
      });

      it('returns true when header is older than one month', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // 31 days old > 30
         const old = new Date('2024-12-15');
         expect(visitor.isStale(old, makeOptions({ timeWindow: ETimeWindow.kOneMonth }))).toBe(true);
      });

      it('returns false when header is within one month', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         // 20 days old < 30
         const recent = new Date('2024-12-26');
         expect(visitor.isStale(recent, makeOptions({ timeWindow: ETimeWindow.kOneMonth }))).toBe(false);
      });
   });

   // -------------------------------------------------------------------------
   describe('extractHeaderDate', () => {
      it('returns null when no sentinel is present', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         expect(visitor.extractHeaderDate('// just a comment\nexport const x = 1;')).toBeNull();
      });

      it('extracts a valid date from a sentinel block', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const source  = makeSentinelSource('20250110');
         const result  = visitor.extractHeaderDate(source);
         expect(result).not.toBeNull();
         expect(result!.getFullYear()).toBe(2025);
         expect(result!.getMonth()).toBe(0);   // January
         expect(result!.getDate()).toBe(10);
      });

      it('returns null for a malformed date in the sentinel', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const source  = '// ===Start StrongAI Generated Comment (BADDATE)===\n// ===End StrongAI Generated Comment===\n';
         expect(visitor.extractHeaderDate(source)).toBeNull();
      });

      it('returns null for an impossible calendar date', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const source  = '// ===Start StrongAI Generated Comment (20251399)===\n// ===End StrongAI Generated Comment===\n';
         expect(visitor.extractHeaderDate(source)).toBeNull();
      });
   });

   // -------------------------------------------------------------------------
   describe('stripGeneratedHeader', () => {
      it('removes the sentinel block from a source file', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const source  = makeSentinelSource('20250110');
         const stripped = visitor.stripGeneratedHeader(source);
         expect(stripped).not.toContain('===Start StrongAI Generated Comment');
         expect(stripped).not.toContain('===End StrongAI Generated Comment===');
         expect(stripped).toContain('export class MyClass');
      });

      it('returns the source unchanged when no sentinel is present', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         expect(visitor.stripGeneratedHeader(SAMPLE_SOURCE)).toBe(SAMPLE_SOURCE);
      });
   });

   // -------------------------------------------------------------------------
   describe('insertion placement (@module + copyright + JSDoc)', () => {
      it('inserts after copyright, before JSDoc that documents first export', async () => {
         const source = `/**
 * @module Chat.AzureOpenAI
 * Concrete implementation for Azure OpenAI.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { AzureOpenAI } from 'openai';

/**
 * Concrete implementation of GenericOpenAIChatDriver for Azure OpenAI model.
 * @extends {GenericOpenAIChatDriver}
 */
export class AzureOpenAIChatDriver {}
`;
         const writer = makeFileWriter();
         const visitor = new ModuleHeaderVisitor(makeFileReader(source), writer, makeChatDriver(), makePromptRepo());
         await visitor.visit('/root', ['/root/Chat.AzureOpenAI.ts'], makeOptions());

         const written = (writer.writeFile as sinon.SinonStub).firstCall.args[1] as string;
         const copyrightIdx = written.indexOf('// Copyright (c) 2025, 2026 Jon Verrier');
         const sentinelIdx = written.indexOf('===Start StrongAI Generated Comment');
         const jsdocIdx = written.indexOf('/**\n * Concrete implementation of GenericOpenAIChatDriver');
         const exportIdx = written.indexOf('export class AzureOpenAIChatDriver');

         expect(copyrightIdx).toBeGreaterThanOrEqual(0);
         expect(sentinelIdx).toBeGreaterThanOrEqual(0);
         expect(jsdocIdx).toBeGreaterThanOrEqual(0);
         expect(exportIdx).toBeGreaterThanOrEqual(0);
         // Block must appear after copyright and before the JSDoc that documents the export
         expect(sentinelIdx).toBeGreaterThan(copyrightIdx);
         expect(jsdocIdx).toBeGreaterThan(sentinelIdx);
         expect(exportIdx).toBeGreaterThan(jsdocIdx);
      });
   });

   // -------------------------------------------------------------------------
   describe('buildNewHeader', () => {
      it('wraps the comment in sentinel markers', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const date    = new Date('2025-01-15');
         const header  = visitor.buildNewHeader('Some comment text', date);
         expect(header).toContain('===Start StrongAI Generated Comment (20250115)===');
         expect(header).toContain('===End StrongAI Generated Comment===');
      });

      it('prefixes every comment line with //', () => {
         const visitor = new ModuleHeaderVisitor(makeFileReader(''), makeFileWriter(), makeChatDriver(), makePromptRepo());
         const date    = new Date('2025-01-15');
         const header  = visitor.buildNewHeader('Line one\nLine two', date);
         const lines   = header.split('\n').filter(l => l.startsWith('// Line'));
         expect(lines).toHaveLength(2);
         expect(lines[0]).toBe('// Line one');
         expect(lines[1]).toBe('// Line two');
      });
   });

   // -------------------------------------------------------------------------
   describe('visit', () => {
      it('calls the LLM and writes the file when no header is present', async () => {
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         const visitor = new ModuleHeaderVisitor(makeFileReader(SAMPLE_SOURCE), writer, driver, makePromptRepo());

         await visitor.visit('/root', ['/root/MyModule.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(1);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(1);
         const written = (writer.writeFile as sinon.SinonStub).firstCall.args[1] as string;
         expect(written).toContain('===Start StrongAI Generated Comment');
      });

      it('skips the file when the header is fresh', async () => {
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         // Header dated 3 days ago, time window = 1 week → fresh
         const freshSource = makeSentinelSource('20250112'); // 3 days before 2025-01-15
         const visitor = new ModuleHeaderVisitor(makeFileReader(freshSource), writer, driver, makePromptRepo());

         await visitor.visit('/root', ['/root/MyModule.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(0);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(0);
      });

      it('regenerates a stale header', async () => {
         const writer  = makeFileWriter();
         const driver  = makeChatDriver('New generated comment');
         // Header dated 14 days ago, time window = 1 week → stale
         const staleSource = makeSentinelSource('20250101');
         const visitor = new ModuleHeaderVisitor(makeFileReader(staleSource), writer, driver, makePromptRepo());

         await visitor.visit('/root', ['/root/MyModule.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(1);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(1);
         const written = (writer.writeFile as sinon.SinonStub).firstCall.args[1] as string;
         expect(written).toContain('New generated comment');
         // Old content should not remain
         expect(written).not.toContain(FAKE_COMMENT);
      });

      it('processes multiple files in a directory', async () => {
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         const visitor = new ModuleHeaderVisitor(makeFileReader(SAMPLE_SOURCE), writer, driver, makePromptRepo());

         await visitor.visit('/root', ['/root/A.ts', '/root/B.ts', '/root/C.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(3);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(3);
      });

      it('throws InvalidOperationError when prompt is not found', async () => {
         const noPromptRepo: IPromptRepository = {
            getPrompt:          sinon.stub().returns(undefined),
            expandSystemPrompt: sinon.stub().returns(''),
            expandUserPrompt:   sinon.stub().returns('')
         } as unknown as IPromptRepository;

         const visitor = new ModuleHeaderVisitor(
            makeFileReader(SAMPLE_SOURCE), makeFileWriter(), makeChatDriver(), noPromptRepo
         );

         await expect(
            visitor.visit('/root', ['/root/A.ts'], makeOptions())
         ).rejects.toThrow();
      });
   });
});
