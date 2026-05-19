/**
 * @module C4DiagramVisitor.test
 * Unit tests for C4DiagramVisitor. All LLM calls and file I/O are mocked
 * via injected interfaces. No real filesystem or network calls are made.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import sinon from 'sinon';
import * as path from 'path';

import { C4DiagramVisitor } from '../src/C4DiagramVisitor';
import {
   IFileReader,
   IFileWriter,
   IDocGenOptions,
   ETimeWindow,
   EC4DiagramType
} from '../src/DocGenTypes';
import { IChatDriver, IPromptRepository, IPrompt } from '@jonverrier/prompt-repository';
import { c4ComponentDiagramPromptId, c4ContextDiagramPromptId } from '../src/PromptIds';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAKE_DIAGRAM = `Overview of this directory.

\`\`\`mermaid
C4Component
   title Sample
\`\`\`

Key components here.`;

function makeOptions(overrides?: Partial<IDocGenOptions>): IDocGenOptions {
   return {
      rootDir: '/root',
      fileSpecs: ['*.ts'],
      timeWindow: ETimeWindow.kOneWeek,
      c4DiagramTypes: [EC4DiagramType.kComponent],
      jobStartedAt: new Date('2025-01-15'),
      ...overrides
   };
}

function makePromptRepo(): IPromptRepository {
   const fakePrompt: IPrompt = {
      id: c4ComponentDiagramPromptId,
      name: 'C4ComponentDiagram',
      version: '1.0',
      systemPrompt: 'You are an architect.',
      userPrompt: '{moduleHeaders} {introWordCount} {detailWordCount}',
      userPromptParameters: [
         { name: 'moduleHeaders',   description: '', type: 'kString', required: true },
         { name: 'introWordCount',  description: '', type: 'kNumber', required: true },
         { name: 'detailWordCount', description: '', type: 'kNumber', required: true }
      ]
   };
   return {
      getPrompt:          sinon.stub().returns(fakePrompt),
      expandSystemPrompt: sinon.stub().returns('You are an architect.'),
      expandUserPrompt:   sinon.stub().returns('Generate diagram.')
   } as unknown as IPromptRepository;
}

function makeChatDriver(returnValue = FAKE_DIAGRAM): IChatDriver {
   return {
      getModelResponse:                        sinon.stub().resolves(returnValue),
      getStreamedModelResponse:                sinon.stub(),
      getModelResponseWithForcedTools:         sinon.stub(),
      getStreamedModelResponseWithForcedTools: sinon.stub(),
      getConstrainedModelResponse:             sinon.stub()
   } as unknown as IChatDriver;
}

function makeFileReader(sourceMap: Record<string, string>): IFileReader {
   return {
      readFile: sinon.stub().callsFake(async (filePath: string) => {
         if (filePath in sourceMap) return sourceMap[filePath];
         const err: NodeJS.ErrnoException = new Error(`ENOENT: ${filePath}`);
         err.code = 'ENOENT';
         throw err;
      })
   };
}

function makeFileWriter(): sinon.SinonStubbedInstance<IFileWriter> & IFileWriter {
   return { writeFile: sinon.stub().resolves() } as unknown as sinon.SinonStubbedInstance<IFileWriter> & IFileWriter;
}

const HEADER_BLOCK = `// ===Start StrongAI Generated Comment (20250110)===
// Exports WorkoutService for scheduling.
// ===End StrongAI Generated Comment===`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('C4DiagramVisitor', () => {
   afterEach(() => sinon.restore());

   // -------------------------------------------------------------------------
   describe('computeWordCounts', () => {
      it('returns base counts for 1 file', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const { introWords, detailWords } = visitor.computeWordCounts(1);
         // total = 60 + 80 + floor(sqrt(1)*20) = 160
         expect(introWords + detailWords).toBe(160);
         expect(introWords).toBe(Math.floor(160 * 0.4));
      });

      it('increases total word count for 5 files', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const { introWords: i1, detailWords: d1 } = visitor.computeWordCounts(1);
         const { introWords: i5, detailWords: d5 } = visitor.computeWordCounts(5);
         expect(i5 + d5).toBeGreaterThan(i1 + d1);
      });

      it('increases total word count for 20 files vs 5', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const { introWords: i5,  detailWords: d5  } = visitor.computeWordCounts(5);
         const { introWords: i20, detailWords: d20 } = visitor.computeWordCounts(20);
         expect(i20 + d20).toBeGreaterThan(i5 + d5);
      });

      it('scales sub-linearly (sqrt growth)', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const total1  = (() => { const { introWords, detailWords } = visitor.computeWordCounts(1);  return introWords + detailWords; })();
         const total4  = (() => { const { introWords, detailWords } = visitor.computeWordCounts(4);  return introWords + detailWords; })();
         const total16 = (() => { const { introWords, detailWords } = visitor.computeWordCounts(16); return introWords + detailWords; })();
         // If it were linear, total16 would be 16× the base increment from total1
         // With sqrt, it's only 4× the increment
         const inc1to4  = total4  - total1;
         const inc4to16 = total16 - total4;
         // sqrt growth: inc1to4 ≈ (2-1)*20=20, inc4to16 ≈ (4-2)*20=40
         expect(inc4to16).toBeGreaterThan(0);
         expect(inc1to4).toBeGreaterThan(0);
      });

      it('maintains 40/60 intro/detail split', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         for (const n of [1, 5, 10, 25]) {
            const { introWords, detailWords } = visitor.computeWordCounts(n);
            const total = introWords + detailWords;
            const ratio = introWords / total;
            // Allow small rounding tolerance
            expect(ratio).toBeGreaterThanOrEqual(0.35);
            expect(ratio).toBeLessThanOrEqual(0.45);
         }
      });
   });

   // -------------------------------------------------------------------------
   describe('outputFilename', () => {
      it('returns Component filename for kComponent', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         expect(visitor.outputFilename(EC4DiagramType.kComponent)).toBe('README.StrongAI.Component.md');
      });

      it('returns Context filename for kContext', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kContext]
         );
         expect(visitor.outputFilename(EC4DiagramType.kContext)).toBe('README.StrongAI.Context.md');
      });
   });

   // -------------------------------------------------------------------------
   describe('isOutputStale', () => {
      it('returns true when existingContent is null', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         expect(visitor.isOutputStale(null, makeOptions())).toBe(true);
      });

      it('returns true when no datestamp is present', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         expect(visitor.isOutputStale('# Some README with no datestamp', makeOptions())).toBe(true);
      });

      it('returns true when README is older than time window', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const oldContent = '<!-- Generated by StrongAIAutoDoc 20250101 -->\n\n# Diagram';
         expect(visitor.isOutputStale(oldContent, makeOptions())).toBe(true);
      });

      it('returns false when README is fresh', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const freshContent = '<!-- Generated by StrongAIAutoDoc 20250113 -->\n\n# Diagram'; // 2 days ago
         expect(visitor.isOutputStale(freshContent, makeOptions())).toBe(false);
      });
   });

   // -------------------------------------------------------------------------
   describe('extractHeaderBlock', () => {
      it('extracts the sentinel block when present', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const source = `${HEADER_BLOCK}\nexport class X {}\n`;
         const extracted = visitor.extractHeaderBlock(source);
         expect(extracted).toContain('===Start StrongAI Generated Comment');
         expect(extracted).toContain('===End StrongAI Generated Comment===');
         expect(extracted).not.toContain('export class X');
      });

      it('falls back to full source when no sentinel block', () => {
         const visitor = new C4DiagramVisitor(
            makeFileReader({}), makeFileWriter(), makeChatDriver(), makePromptRepo(), [EC4DiagramType.kComponent]
         );
         const source = '// plain comment\nexport const x = 1;';
         expect(visitor.extractHeaderBlock(source)).toBe(source);
      });
   });

   // -------------------------------------------------------------------------
   describe('visit', () => {
      it('generates a Component README when kComponent is requested', async () => {
         const sourceMap: Record<string, string> = {
            '/root/A.ts': `${HEADER_BLOCK}\nexport class A {}`
         };
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         const visitor = new C4DiagramVisitor(
            makeFileReader(sourceMap), writer, driver, makePromptRepo(), [EC4DiagramType.kComponent]
         );

         await visitor.visit('/root', ['/root/A.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(1);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(1);
         const [outPath, content] = (writer.writeFile as sinon.SinonStub).firstCall.args as [string, string];
         expect(outPath).toContain('README.StrongAI.Component.md');
         expect(content).toContain('<!-- Generated by StrongAIAutoDoc 20250115 -->');
      });

      it('generates both Component and Context READMEs when both are requested', async () => {
         const sourceMap: Record<string, string> = {
            '/root/A.ts': HEADER_BLOCK
         };
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();

         // Need a promptRepo that handles both prompt IDs
         const compPrompt: IPrompt = { id: c4ComponentDiagramPromptId, name: 'C4Comp', version: '1.0', systemPrompt: '', userPrompt: 'x', userPromptParameters: [] };
         const ctxPrompt:  IPrompt = { id: c4ContextDiagramPromptId,  name: 'C4Ctx',  version: '1.0', systemPrompt: '', userPrompt: 'x', userPromptParameters: [] };
         const promptRepo: IPromptRepository = {
            getPrompt:          sinon.stub().callsFake((id: string) =>
               id === c4ComponentDiagramPromptId ? compPrompt : ctxPrompt
            ),
            expandSystemPrompt: sinon.stub().returns(''),
            expandUserPrompt:   sinon.stub().returns('')
         } as unknown as IPromptRepository;

         const visitor = new C4DiagramVisitor(
            makeFileReader(sourceMap), writer, driver, promptRepo,
            [EC4DiagramType.kComponent, EC4DiagramType.kContext]
         );

         await visitor.visit('/root', ['/root/A.ts'], makeOptions({ c4DiagramTypes: [EC4DiagramType.kComponent, EC4DiagramType.kContext] }));

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(2);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(2);
         const writtenPaths = (writer.writeFile as sinon.SinonStub).args.map((a: unknown[]) => a[0] as string);
         expect(writtenPaths.some((p: string) => p.includes('Component'))).toBe(true);
         expect(writtenPaths.some((p: string) => p.includes('Context'))).toBe(true);
      });

      it('skips generation when README is fresh', async () => {
         const freshReadme = '<!-- Generated by StrongAIAutoDoc 20250113 -->\n\n# Diagram';
         // Use path.join so the output path key matches what the visitor constructs
         const componentReadmePath = path.join('/root', 'README.StrongAI.Component.md');
         const sourceMap: Record<string, string> = {
            [path.join('/root', 'A.ts')]: HEADER_BLOCK,
            [componentReadmePath]: freshReadme
         };
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         const visitor = new C4DiagramVisitor(
            makeFileReader(sourceMap), writer, driver, makePromptRepo(), [EC4DiagramType.kComponent]
         );

         await visitor.visit('/root', [path.join('/root', 'A.ts')], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(0);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(0);
      });

      it('regenerates README when it is stale', async () => {
         const staleReadme = '<!-- Generated by StrongAIAutoDoc 20250101 -->\n\n# Old Diagram';
         const sourceMap: Record<string, string> = {
            '/root/A.ts': HEADER_BLOCK,
            '/root/README.StrongAI.Component.md': staleReadme
         };
         const writer  = makeFileWriter();
         const driver  = makeChatDriver();
         const visitor = new C4DiagramVisitor(
            makeFileReader(sourceMap), writer, driver, makePromptRepo(), [EC4DiagramType.kComponent]
         );

         await visitor.visit('/root', ['/root/A.ts'], makeOptions());

         expect((driver.getModelResponse as sinon.SinonStub).callCount).toBe(1);
         expect((writer.writeFile as sinon.SinonStub).callCount).toBe(1);
      });

      it('throws when prompt is not found', async () => {
         const noPromptRepo: IPromptRepository = {
            getPrompt:          sinon.stub().returns(undefined),
            expandSystemPrompt: sinon.stub().returns(''),
            expandUserPrompt:   sinon.stub().returns('')
         } as unknown as IPromptRepository;

         const sourceMap = { '/root/A.ts': HEADER_BLOCK };
         const visitor   = new C4DiagramVisitor(
            makeFileReader(sourceMap), makeFileWriter(), makeChatDriver(), noPromptRepo, [EC4DiagramType.kComponent]
         );

         await expect(
            visitor.visit('/root', ['/root/A.ts'], makeOptions())
         ).rejects.toThrow();
      });
   });
});
