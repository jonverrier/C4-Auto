/**
 * @module ModuleHeaderExtract.test
 * Contract tests for StrongAI module header sentinel markers (filesystem pipeline contract).
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';

import {
   SENTINEL_CLOSE,
   SENTINEL_OPEN_PREFIX,
   SENTINEL_OPEN_SUFFIX,
   buildModuleHeaderBlock,
   extractModuleHeaderBlock,
   extractModuleHeaderDate,
   stripModuleHeaderBlocks
} from '../src/ModuleHeaderExtract';

const SAMPLE_TAIL = `// Copyright (c) 2025, 2026 Jon Verrier
import { something } from 'somewhere';
export class MyClass {}
`;

function makeSentinelBlock(dateStr: string, comment = 'Module summary line.'): string {
   return [
      `${SENTINEL_OPEN_PREFIX}${dateStr}${SENTINEL_OPEN_SUFFIX}`,
      `// ${comment}`,
      SENTINEL_CLOSE
   ].join('\n');
}

function wrapWithSentinel(dateStr: string, comment?: string): string {
   return `${makeSentinelBlock(dateStr, comment)}\n${SAMPLE_TAIL}`;
}

describe('ModuleHeaderExtract contract', () => {
   describe('sentinel marker constants', () => {
      it('uses the documented opening and closing marker strings', () => {
         expect(SENTINEL_OPEN_PREFIX).toBe('// ===Start StrongAI Generated Comment (');
         expect(SENTINEL_OPEN_SUFFIX).toBe(')===');
         expect(SENTINEL_CLOSE).toBe('// ===End StrongAI Generated Comment===');
      });

      it('buildModuleHeaderBlock embeds YYYYMMDD in the opening line', () => {
         const block = buildModuleHeaderBlock('Summary text.', new Date('2025-03-25'));
         expect(block.startsWith('// ===Start StrongAI Generated Comment (20250325)===')).toBe(true);
         expect(block).toContain('// Summary text.');
         expect(block).toContain(SENTINEL_CLOSE);
         expect(block.endsWith('\n\n')).toBe(true);
      });
   });

   describe('extractModuleHeaderBlock', () => {
      it('extracts a well-formed sentinel block without surrounding source', () => {
         const block = makeSentinelBlock('20250110');
         const extracted = extractModuleHeaderBlock(wrapWithSentinel('20250110'));
         expect(extracted).toBe(block);
      });

      it('returns full source when no opening sentinel is present', () => {
         const source = '// plain comment\nexport const x = 1;\n';
         expect(extractModuleHeaderBlock(source)).toBe(source);
      });

      it('returns full source when close sentinel is missing', () => {
         const source = `${SENTINEL_OPEN_PREFIX}20250110${SENTINEL_OPEN_SUFFIX}\n// orphan\nexport const x = 1;\n`;
         expect(extractModuleHeaderBlock(source)).toBe(source);
      });

      it('extracts only the first block when code follows the close sentinel', () => {
         const source = wrapWithSentinel('20250110');
         const extracted = extractModuleHeaderBlock(source);
         expect(extracted).not.toContain('export class MyClass');
         expect(extracted).toContain(SENTINEL_CLOSE);
      });
   });

   describe('extractModuleHeaderDate', () => {
      it('returns null when no sentinel is present', () => {
         expect(extractModuleHeaderDate(SAMPLE_TAIL)).toBeNull();
      });

      it('parses date from a line-start sentinel', () => {
         const date = extractModuleHeaderDate(wrapWithSentinel('20250110'));
         expect(date).not.toBeNull();
         expect(date!.getFullYear()).toBe(2025);
         expect(date!.getMonth()).toBe(0);
         expect(date!.getDate()).toBe(10);
      });

      it('parses date from a merged JSDoc sentinel (flexible match)', () => {
         const source = [
            '/**',
            ' * @module Example',
            ' */ // ===Start StrongAI Generated Comment (20250201)===',
            '// Generated summary.',
            SENTINEL_CLOSE,
            '',
            SAMPLE_TAIL
         ].join('\n');
         const date = extractModuleHeaderDate(source);
         expect(date).not.toBeNull();
         expect(date!.getFullYear()).toBe(2025);
         expect(date!.getMonth()).toBe(1);
         expect(date!.getDate()).toBe(1);
      });

      it('returns null for non-numeric sentinel date token', () => {
         const source = `${SENTINEL_OPEN_PREFIX}BADDATE${SENTINEL_OPEN_SUFFIX}\n${SENTINEL_CLOSE}\n`;
         expect(extractModuleHeaderDate(source)).toBeNull();
      });

      it('returns null for impossible calendar dates', () => {
         const source = wrapWithSentinel('20251399');
         expect(extractModuleHeaderDate(source)).toBeNull();
      });
   });

   describe('stripModuleHeaderBlocks', () => {
      it('removes a standard sentinel block and preserves remaining source', () => {
         const source = wrapWithSentinel('20250110');
         const stripped = stripModuleHeaderBlocks(source);
         expect(stripped).not.toContain('===Start StrongAI Generated Comment');
         expect(stripped).not.toContain(SENTINEL_CLOSE);
         expect(stripped).toContain('export class MyClass');
      });

      it('returns source unchanged when no sentinel is present', () => {
         expect(stripModuleHeaderBlocks(SAMPLE_TAIL)).toBe(SAMPLE_TAIL);
      });

      it('removes multiple sentinel blocks', () => {
         const source = `${wrapWithSentinel('20250101')}\n${wrapWithSentinel('20250102', 'Second block.')}\n`;
         const stripped = stripModuleHeaderBlocks(source);
         expect(stripped).not.toContain('===Start StrongAI Generated Comment');
         expect(stripped).toContain('export class MyClass');
      });

      it('removes merged JSDoc sentinel from the JSDoc close marker onward', () => {
         const source = [
            '/**',
            ' * @module Example',
            ' */ // ===Start StrongAI Generated Comment (20250110)===',
            '// Summary.',
            SENTINEL_CLOSE,
            '',
            SAMPLE_TAIL
         ].join('\n');
         const stripped = stripModuleHeaderBlocks(source);
         expect(stripped).not.toContain('===Start StrongAI Generated Comment');
         expect(stripped).not.toContain(SENTINEL_CLOSE);
         expect(stripped).toContain('* @module Example');
         expect(stripped).not.toContain('*/');
         expect(stripped).toContain('export class MyClass');
      });
   });

   describe('build and round-trip contract', () => {
      it('round-trips through extract after build', () => {
         const jobStartedAt = new Date('2025-06-01');
         const built = buildModuleHeaderBlock('Line one.\nLine two.', jobStartedAt);
         const source = built + SAMPLE_TAIL;

         const extracted = extractModuleHeaderBlock(source);
         expect(extracted).toContain('// Line one.');
         expect(extracted).toContain('// Line two.');
         expect(extracted).toContain(SENTINEL_CLOSE);

         const date = extractModuleHeaderDate(source);
         expect(date).not.toBeNull();
         expect(date!.getFullYear()).toBe(2025);
         expect(date!.getMonth()).toBe(5);
         expect(date!.getDate()).toBe(1);
      });

      it('strip then build replaces prior header while preserving tail', () => {
         const original = wrapWithSentinel('20240101', 'Old summary.');
         const stripped = stripModuleHeaderBlocks(original);
         const rebuilt = buildModuleHeaderBlock('New summary.', new Date('2025-01-15'));
         const combined = rebuilt + stripped;

         expect(combined).toContain('// New summary.');
         expect(combined).not.toContain('Old summary.');
         expect(combined).toContain('export class MyClass');
         expect(extractModuleHeaderDate(combined)).toEqual(new Date('2025-01-15'));
      });
   });
});
