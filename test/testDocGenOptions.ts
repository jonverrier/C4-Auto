/**
 * @module testDocGenOptions
 * Shared defaults for IDocGenOptions in unit and integration tests.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { EC4DiagramType, ETimeWindow, IDocGenOptions } from '../src/DocGenTypes';
import { DEFAULT_C4_OUTPUT_FILES } from '../src/C4ReadmeUtils';

/**
 * Builds test IDocGenOptions with standard defaults; override any field via partial.
 * @param overrides - Fields to override
 * @returns Complete IDocGenOptions for tests
 */
export function makeTestDocGenOptions(overrides?: Partial<IDocGenOptions>): IDocGenOptions {
   return {
      rootDir: '/root',
      fileSpecs: ['*.ts'],
      timeWindow: ETimeWindow.kOneMonth,
      c4DiagramTypes: [],
      rollup: false,
      hasSubdirectorySources: false,
      componentOutputFile: DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kComponent],
      contextOutputFile: DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kContext],
      jobStartedAt: new Date('2025-01-15'),
      ...overrides
   };
}
