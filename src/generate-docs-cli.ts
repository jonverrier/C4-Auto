#!/usr/bin/env node
/**
 * @module generate-docs-cli
 * Command-line entry point for the StrongAI automatic documentation generator.
 * Parses arguments, constructs IDocGenOptions, wires visitors via VisitorFactory,
 * and runs the DirectoryTreeTraverser.
 *
 * Usage:
 *   ts-node src/generate-docs-cli.ts --dir <path> --files <spec...>
 *       --one-week | --two-weeks | --one-month
 *       [--c4component] [--c4context]
 *
 * Examples:
 *   ts-node src/generate-docs-cli.ts --dir ../Assistant/src --files "*.ts" --one-week --c4component
 *   ts-node src/generate-docs-cli.ts --dir ../AssistantIngest/src --files "*.ts" "*.tsx" --one-month --c4component --c4context
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// Command-line entry point for the StrongAI automatic documentation generator. It parses CLI flags into a validated IDocGenOptions object, builds visitors via VisitorFactory, and walks a directory tree to generate or refresh docs based on a selected time window.
//
// There are no public exports; this module is an executable script. Internally it defines printUsage, parseArgs, and main. Key imports: InvalidParameterError, ETimeWindow, EC4DiagramType, IDocGenOptions, VisitorFactory, DirectoryTreeTraverser, NodeDirectoryReader, MinimatchFileFilter.
// ===End StrongAI Generated Comment===

import { InvalidParameterError } from '@jonverrier/prompt-repository';
import { ETimeWindow, EC4DiagramType, IDocGenOptions } from './DocGenTypes';
import { VisitorFactory } from './VisitorFactory';
import { DirectoryTreeTraverser, NodeDirectoryReader, MinimatchFileFilter } from './DirectoryTreeTraverser';

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
   console.log('Usage: generate-docs-cli --dir <path> --files <spec...> <time-window> [diagram-flags]');
   console.log('');
   console.log('Required:');
   console.log('  --dir <path>         Root directory to traverse');
   console.log('  --files <spec...>    One or more glob file specs (e.g. "*.ts" "*.tsx")');
   console.log('');
   console.log('Time window (exactly one required):');
   console.log('  --one-week           Regenerate headers older than 1 week');
   console.log('  --two-weeks          Regenerate headers older than 2 weeks');
   console.log('  --one-month          Regenerate headers older than 1 month');
   console.log('');
   console.log('Diagram flags (optional, may be combined):');
   console.log('  --c4component        Generate C4 Component diagrams');
   console.log('  --c4context          Generate C4 Context diagrams');
   console.log('');
   console.log('  --help, -h           Show this help message');
}

/**
 * Parses process.argv into an IDocGenOptions structure.
 * Throws InvalidParameterError for missing or invalid arguments.
 */
function parseArgs(): IDocGenOptions {
   const args = process.argv.slice(2);

   let rootDir: string | null = null;
   const fileSpecs: string[]         = [];
   const timeWindowFlags: ETimeWindow[] = [];
   const c4DiagramTypes: EC4DiagramType[] = [];

   for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
         case '--help':
         case '-h':
            printUsage();
            process.exit(0);
            break;

         case '--dir':
            if (i + 1 >= args.length) {
               throw new InvalidParameterError('--dir requires a path argument');
            }
            rootDir = args[++i];
            break;

         case '--files':
            // Consume all following non-flag arguments as file specs
            while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
               fileSpecs.push(args[++i]);
            }
            if (fileSpecs.length === 0) {
               throw new InvalidParameterError('--files requires at least one glob spec');
            }
            break;

         case '--one-week':
            timeWindowFlags.push(ETimeWindow.kOneWeek);
            break;

         case '--two-weeks':
            timeWindowFlags.push(ETimeWindow.kTwoWeeks);
            break;

         case '--one-month':
            timeWindowFlags.push(ETimeWindow.kOneMonth);
            break;

         case '--c4component':
            c4DiagramTypes.push(EC4DiagramType.kComponent);
            break;

         case '--c4context':
            c4DiagramTypes.push(EC4DiagramType.kContext);
            break;

         default:
            throw new InvalidParameterError(`Unknown argument: ${arg}`);
      }
   }

   // Validate required arguments
   if (!rootDir) {
      throw new InvalidParameterError('--dir is required');
   }

   if (fileSpecs.length === 0) {
      throw new InvalidParameterError('--files is required with at least one spec');
   }

   if (timeWindowFlags.length === 0) {
      throw new InvalidParameterError('Exactly one time-window flag is required: --one-week, --two-weeks, or --one-month');
   }

   if (timeWindowFlags.length > 1) {
      throw new InvalidParameterError('Only one time-window flag may be specified');
   }

   return {
      rootDir,
      fileSpecs,
      timeWindow: timeWindowFlags[0],
      c4DiagramTypes,
      jobStartedAt: new Date()
   };
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
   const options  = parseArgs();
   const visitors = VisitorFactory.createAll(options);
   const traverser = new DirectoryTreeTraverser(
      visitors,
      new NodeDirectoryReader(),
      new MinimatchFileFilter()
   );

   console.log(`Generating docs for: ${options.rootDir}`);
   console.log(`File specs: ${options.fileSpecs.join(', ')}`);
   console.log(`Time window: ${options.timeWindow}`);
   if (options.c4DiagramTypes.length > 0) {
      console.log(`C4 diagram types: ${options.c4DiagramTypes.join(', ')}`);
   }
   console.log('');

   await traverser.traverse(options);
   console.log('Done.');
}

main().catch((error: unknown) => {
   if (error instanceof InvalidParameterError) {
      console.error(`Error: ${error.message}`);
      console.error('');
      printUsage();
      process.exit(2);
   }
   console.error('Unexpected error:', error);
   process.exit(1);
});
