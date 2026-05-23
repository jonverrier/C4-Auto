/**
 * @module generate-docs-cli.test
 * Unit tests for CLI argument parsing.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';
import { InvalidParameterError } from '@jonverrier/prompt-repository';
import { EC4DiagramType, ETimeWindow } from '../src/DocGenTypes';
import { DEFAULT_C4_OUTPUT_FILES } from '../src/C4ReadmeUtils';
import { parseArgs } from '../src/generate-docs-cli';

describe('generate-docs-cli.parseArgs', () => {
   it('parses required flags and defaults output filenames', () => {
      const options = parseArgs([
         '--dir', './src',
         '--files', '*.ts', '*.tsx',
         '--one-month',
         '--c4component'
      ]);

      expect(options.rootDir).toBe('./src');
      expect(options.fileSpecs).toEqual(['*.ts', '*.tsx']);
      expect(options.timeWindow).toBe(ETimeWindow.kOneMonth);
      expect(options.c4DiagramTypes).toEqual([EC4DiagramType.kComponent]);
      expect(options.rollup).toBe(false);
      expect(options.componentOutputFile).toBe(DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kComponent]);
      expect(options.contextOutputFile).toBe(DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kContext]);
   });

   it('parses custom output filenames', () => {
      const options = parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--c4component',
         '--c4context',
         '--component-file', 'ARCHITECTURE.Component.md',
         '--context-file', 'ARCHITECTURE.Context.md'
      ]);

      expect(options.componentOutputFile).toBe('ARCHITECTURE.Component.md');
      expect(options.contextOutputFile).toBe('ARCHITECTURE.Context.md');
   });

   it('parses rollup when a diagram type is requested', () => {
      const options = parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--two-weeks',
         '--c4context',
         '--rollup'
      ]);

      expect(options.rollup).toBe(true);
      expect(options.c4DiagramTypes).toEqual([EC4DiagramType.kContext]);
   });

   it('rejects README.md as component output file', () => {
      expect(() => parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--c4component',
         '--component-file', 'README.md'
      ])).toThrow(InvalidParameterError);
   });

   it('rejects path-like output filenames', () => {
      expect(() => parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--c4component',
         '--context-file', 'docs/README.Context.md'
      ])).toThrow(InvalidParameterError);
   });

   it('rejects rollup without diagram flags', () => {
      expect(() => parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--rollup'
      ])).toThrow(InvalidParameterError);
   });

   it('rejects multiple time-window flags', () => {
      expect(() => parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week', '--two-weeks'
      ])).toThrow(InvalidParameterError);
   });

   it('parses --dry-run and --skip-headers', () => {
      const options = parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--c4component',
         '--dry-run',
         '--skip-headers'
      ]);

      expect(options.dryRun).toBe(true);
      expect(options.skipHeaders).toBe(true);
   });

   it('parses --diagrams-only as an alias for --skip-headers', () => {
      const options = parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-month',
         '--c4context',
         '--diagrams-only'
      ]);

      expect(options.skipHeaders).toBe(true);
   });

   it('rejects --skip-headers without diagram flags', () => {
      expect(() => parseArgs([
         '--dir', './src',
         '--files', '*.ts',
         '--one-week',
         '--skip-headers'
      ])).toThrow(InvalidParameterError);
   });
});
