/**
 * @module DesignContextUtils.test
 * Unit tests for design document discovery and prompt formatting.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import * as path from 'path';
import {
   buildDesignFileCandidates,
   formatDesignContextForPrompt,
   loadDesignContext
} from '../src/DesignContextUtils';
import { IFileReader } from '../src/DocGenTypes';

describe('DesignContextUtils', () => {
   it('buildDesignFileCandidates checks root and parent directories by default', () => {
      const rootDir = path.resolve('/project/src');
      const candidates = buildDesignFileCandidates(rootDir);

      expect(candidates).toContain(path.join(rootDir, 'Design.md'));
      expect(candidates).toContain(path.join(rootDir, 'DESIGN.md'));
      expect(candidates).toContain(path.join(path.dirname(rootDir), 'Design.md'));
      expect(candidates).toContain(path.join(path.dirname(rootDir), 'DESIGN.md'));
   });

   it('buildDesignFileCandidates uses explicit design file when provided', () => {
      const candidates = buildDesignFileCandidates('/project/src', 'docs/Design.md');
      expect(candidates).toEqual([path.resolve('/project/src/docs/Design.md')]);
   });

   it('formatDesignContextForPrompt returns empty string when design is absent', () => {
      expect(formatDesignContextForPrompt(null)).toBe('');
   });

   it('loadDesignContext returns the first readable candidate', async () => {
      const rootDir = path.resolve('/project/src');
      const designPath = path.join(path.dirname(rootDir), 'DESIGN.md');
      const fileReader: IFileReader = {
         readFile: async (filePath: string) => {
            if (filePath === designPath) {
               return '# Design intent\nPackage boundaries.';
            }
            throw new Error(`missing ${filePath}`);
         },
         getFileModifiedTime: async (filePath: string) => {
            if (filePath === designPath) {
               return new Date('2025-01-20');
            }
            return null;
         }
      };

      const design = await loadDesignContext(
         fileReader,
         rootDir,
         undefined,
         fileReader.getFileModifiedTime?.bind(fileReader)
      );

      expect(design).not.toBeNull();
      expect(design!.relativePath).toBe('DESIGN.md');
      expect(design!.content).toContain('Design intent');
      expect(design!.modifiedAt?.toISOString()).toBe(new Date('2025-01-20').toISOString());
   });

   it('loadDesignContext returns null when no design file exists', async () => {
      const fileReader: IFileReader = {
         readFile: async () => {
            throw new Error('missing');
         }
      };

      const design = await loadDesignContext(fileReader, '/project/src');
      expect(design).toBeNull();
   });
});
