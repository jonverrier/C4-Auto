/**
 * @module DirectoryTreeTraverser.test
 * Unit tests for DirectoryTreeTraverser. All file system operations are mocked
 * via injected IDirectoryReader and IFileFilter implementations.
 * Uses path.join throughout so tests are platform-agnostic (handles Windows backslashes).
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import sinon from 'sinon';
import * as path from 'path';

import { DirectoryTreeTraverser } from '../src/DirectoryTreeTraverser';
import {
   IDirectoryReader,
   IFileFilter,
   IDirectoryVisitor,
   IDocGenOptions,
   ETimeWindow,
   EC4DiagramType,
   EVisitorPriority
} from '../src/DocGenTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use a platform-safe root so path.join works correctly on both Unix and Windows.
const ROOT = path.resolve('testroot');

function makeOptions(overrides?: Partial<IDocGenOptions>): IDocGenOptions {
   return {
      rootDir: ROOT,
      fileSpecs: ['*.ts'],
      timeWindow: ETimeWindow.kOneWeek,
      c4DiagramTypes: [],
      jobStartedAt: new Date('2025-01-15'),
      ...overrides
   };
}

/** Returns a stub IDirectoryVisitor with controllable priority and fileSpecs. */
function makeVisitor(priority: EVisitorPriority, fileSpecs: string[] = ['*.ts']): sinon.SinonStubbedInstance<IDirectoryVisitor> & IDirectoryVisitor {
   return {
      priority,
      fileSpecs,
      visit: sinon.stub().resolves()
   } as unknown as sinon.SinonStubbedInstance<IDirectoryVisitor> & IDirectoryVisitor;
}

/**
 * Returns an IDirectoryReader stub backed by a simple map of absolute path → entry names.
 * Entry names that appear as keys in the tree are treated as directories; others as files.
 */
function makeDirectoryReader(tree: Record<string, string[]>): IDirectoryReader {
   return {
      listDirectory: sinon.stub().callsFake(async (dirPath: string) => {
         return tree[dirPath] ?? [];
      }),
      isDirectory: sinon.stub().callsFake(async (itemPath: string) => {
         return Object.prototype.hasOwnProperty.call(tree, itemPath);
      })
   };
}

/** Returns an IFileFilter that matches filenames ending with matchExt. */
function makeFileFilter(matchExt: string): IFileFilter {
   return {
      matches: sinon.stub().callsFake((filename: string) => {
         return filename.endsWith(matchExt);
      })
   };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DirectoryTreeTraverser', () => {

   afterEach(() => sinon.restore());

   // -------------------------------------------------------------------------
   describe('construction', () => {
      it('throws InvalidParameterError when no visitors are provided', () => {
         const reader = makeDirectoryReader({});
         const filter = makeFileFilter('.ts');
         expect(() => new DirectoryTreeTraverser([], reader, filter)).toThrow();
      });

      it('accepts a single visitor without throwing', () => {
         const reader  = makeDirectoryReader({ [ROOT]: [] });
         const filter  = makeFileFilter('.ts');
         const visitor = makeVisitor(EVisitorPriority.kFirst);
         expect(() => new DirectoryTreeTraverser([visitor], reader, filter)).not.toThrow();
      });
   });

   // -------------------------------------------------------------------------
   describe('visitor dispatch', () => {
      it('calls a visitor for a directory containing matching files', async () => {
         const tree: Record<string, string[]> = {
            [ROOT]: ['foo.ts']
         };
         const reader    = makeDirectoryReader(tree);
         const filter    = makeFileFilter('.ts');
         const visitor   = makeVisitor(EVisitorPriority.kFirst);
         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);

         await traverser.traverse(makeOptions());

         expect((visitor.visit as sinon.SinonStub).callCount).toBe(1);
         const [dirPath, filePaths] = (visitor.visit as sinon.SinonStub).firstCall.args as [string, string[], IDocGenOptions];
         expect(dirPath).toBe(ROOT);
         expect(filePaths).toEqual([path.join(ROOT, 'foo.ts')]);
      });

      it('does not call a visitor for a directory with no matching files', async () => {
         const tree: Record<string, string[]> = {
            [ROOT]: ['readme.md']
         };
         const reader    = makeDirectoryReader(tree);
         const filter    = makeFileFilter('.ts');
         const visitor   = makeVisitor(EVisitorPriority.kFirst);
         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);

         await traverser.traverse(makeOptions());

         expect((visitor.visit as sinon.SinonStub).callCount).toBe(0);
      });

      it('passes IDocGenOptions through to the visitor', async () => {
         const tree: Record<string, string[]> = { [ROOT]: ['a.ts'] };
         const reader    = makeDirectoryReader(tree);
         const filter    = makeFileFilter('.ts');
         const visitor   = makeVisitor(EVisitorPriority.kFirst);
         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);
         const options   = makeOptions({ c4DiagramTypes: [EC4DiagramType.kComponent] });

         await traverser.traverse(options);

         const passedOptions = (visitor.visit as sinon.SinonStub).firstCall.args[2] as IDocGenOptions;
         expect(passedOptions.c4DiagramTypes).toEqual([EC4DiagramType.kComponent]);
      });
   });

   // -------------------------------------------------------------------------
   describe('visitor priority ordering', () => {
      it('calls visitors in ascending priority order within a directory', async () => {
         const tree: Record<string, string[]> = { [ROOT]: ['a.ts'] };
         const reader = makeDirectoryReader(tree);
         const filter = makeFileFilter('.ts');

         const callOrder: number[] = [];
         const v1 = makeVisitor(EVisitorPriority.kFirst);
         const v2 = makeVisitor(EVisitorPriority.kSecond);
         (v1.visit as sinon.SinonStub).callsFake(async () => { callOrder.push(1); });
         (v2.visit as sinon.SinonStub).callsFake(async () => { callOrder.push(2); });

         // Register in reverse order to prove sorting works
         const traverser = new DirectoryTreeTraverser([v2, v1], reader, filter);
         await traverser.traverse(makeOptions());

         expect(callOrder).toEqual([1, 2]);
      });
   });

   // -------------------------------------------------------------------------
   describe('depth-first traversal', () => {
      it('traverses subdirectories depth-first', async () => {
         const sub1 = path.join(ROOT, 'sub1');
         const sub2 = path.join(ROOT, 'sub2');
         const tree: Record<string, string[]> = {
            [ROOT]: ['root.ts', 'sub1', 'sub2'],
            [sub1]: ['sub1.ts'],
            [sub2]: ['sub2.ts']
         };
         const reader  = makeDirectoryReader(tree);
         const filter  = makeFileFilter('.ts');
         const visited: string[] = [];
         const visitor = makeVisitor(EVisitorPriority.kFirst);
         (visitor.visit as sinon.SinonStub).callsFake(async (dir: string) => { visited.push(dir); });

         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);
         await traverser.traverse(makeOptions());

         expect(visited[0]).toBe(ROOT);
         expect(visited).toContain(sub1);
         expect(visited).toContain(sub2);
      });

      it('visits nested subdirectories', async () => {
         const child      = path.join(ROOT, 'child');
         const grandchild = path.join(ROOT, 'child', 'grandchild');
         const tree: Record<string, string[]> = {
            [ROOT]:       ['a.ts', 'child'],
            [child]:      ['b.ts', 'grandchild'],
            [grandchild]: ['c.ts']
         };
         const reader  = makeDirectoryReader(tree);
         const filter  = makeFileFilter('.ts');
         const visited: string[] = [];
         const visitor = makeVisitor(EVisitorPriority.kFirst);
         (visitor.visit as sinon.SinonStub).callsFake(async (dir: string) => { visited.push(dir); });

         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);
         await traverser.traverse(makeOptions());

         expect(visited).toContain(ROOT);
         expect(visited).toContain(child);
         expect(visited).toContain(grandchild);
      });
   });

   // -------------------------------------------------------------------------
   describe('exclusion list', () => {
      const EXCLUDED = ['node_modules', 'dist', '.git', '.nyc_output', 'coverage'];

      for (const excluded of EXCLUDED) {
         it(`skips ${excluded} directory`, async () => {
            const excludedPath = path.join(ROOT, excluded);
            const tree: Record<string, string[]> = {
               [ROOT]:        ['a.ts', excluded],
               [excludedPath]: ['secret.ts']
            };
            const reader  = makeDirectoryReader(tree);
            const filter  = makeFileFilter('.ts');
            const visited: string[] = [];
            const visitor = makeVisitor(EVisitorPriority.kFirst);
            (visitor.visit as sinon.SinonStub).callsFake(async (dir: string) => { visited.push(dir); });

            const traverser = new DirectoryTreeTraverser([visitor], reader, filter);
            await traverser.traverse(makeOptions());

            expect(visited).not.toContain(excludedPath);
         });
      }
   });

   // -------------------------------------------------------------------------
   describe('multiple files per directory', () => {
      it('passes all matching files to the visitor', async () => {
         const tree: Record<string, string[]> = {
            [ROOT]: ['a.ts', 'b.ts', 'c.tsx', 'readme.md']
         };
         const reader = makeDirectoryReader(tree);
         const filter: IFileFilter = {
            matches: (_filename: string) =>
               _filename.endsWith('.ts') || _filename.endsWith('.tsx')
         };
         const visitor   = makeVisitor(EVisitorPriority.kFirst, ['*.ts', '*.tsx']);
         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);

         await traverser.traverse(makeOptions({ fileSpecs: ['*.ts', '*.tsx'] }));

         const filePaths = (visitor.visit as sinon.SinonStub).firstCall.args[1] as string[];
         expect(filePaths).toHaveLength(3);
         expect(filePaths).toContain(path.join(ROOT, 'a.ts'));
         expect(filePaths).toContain(path.join(ROOT, 'b.ts'));
         expect(filePaths).toContain(path.join(ROOT, 'c.tsx'));
         expect(filePaths).not.toContain(path.join(ROOT, 'readme.md'));
      });
   });

   // -------------------------------------------------------------------------
   describe('empty directory', () => {
      it('does not call visitor for an empty directory', async () => {
         const tree: Record<string, string[]> = { [ROOT]: [] };
         const reader    = makeDirectoryReader(tree);
         const filter    = makeFileFilter('.ts');
         const visitor   = makeVisitor(EVisitorPriority.kFirst);
         const traverser = new DirectoryTreeTraverser([visitor], reader, filter);

         await traverser.traverse(makeOptions());

         expect((visitor.visit as sinon.SinonStub).callCount).toBe(0);
      });
   });
});
