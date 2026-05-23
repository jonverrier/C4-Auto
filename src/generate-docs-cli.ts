#!/usr/bin/env node
/**
 * @module generate-docs-cli
 * Command-line entry point for the C4-Auto documentation generator.
 * Parses arguments, constructs IDocGenOptions, wires visitors via VisitorFactory,
 * and runs the DirectoryTreeTraverser.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { InvalidParameterError } from '@jonverrier/prompt-repository';
import { ETimeWindow, EC4DiagramType, IDocGenOptions } from './DocGenTypes';
import { VisitorFactory } from './VisitorFactory';
import {
   DirectoryTreeTraverser,
   NodeDirectoryReader,
   MinimatchFileFilter,
   detectSubdirectorySources
} from './DirectoryTreeTraverser';
import {
   DEFAULT_C4_OUTPUT_FILES,
   validateC4OutputFilename
} from './C4ReadmeUtils';

/**
 * Prints usage information to stdout.
 */
function printUsage(): void {
   console.log('Usage: c4-auto --dir <path> --files <spec...> <time-window> [options]');
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
   console.log('  --rollup             Roll up subdirectory generated docs to scan root');
   console.log('');
   console.log('Output filenames (optional):');
   console.log(`  --component-file <name>  Component doc basename (default: ${DEFAULT_C4_OUTPUT_FILES.kComponent})`);
   console.log(`  --context-file <name>    Context doc basename (default: ${DEFAULT_C4_OUTPUT_FILES.kContext})`);
   console.log('');
   console.log('  --help, -h           Show this help message');
}

/**
 * Parses CLI arguments into an IDocGenOptions structure.
 * @param args - Arguments to parse (defaults to process.argv after node executable)
 * @returns Parsed options
 */
export function parseArgs(args: string[] = process.argv.slice(2)): IDocGenOptions {
   let rootDir: string | null = null;
   const fileSpecs: string[]            = [];
   const timeWindowFlags: ETimeWindow[] = [];
   const c4DiagramTypes: EC4DiagramType[] = [];
   let rollup = false;
   let componentOutputFile = DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kComponent];
   let contextOutputFile   = DEFAULT_C4_OUTPUT_FILES[EC4DiagramType.kContext];

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

         case '--rollup':
            rollup = true;
            break;

         case '--component-file':
            if (i + 1 >= args.length) {
               throw new InvalidParameterError('--component-file requires a filename argument');
            }
            componentOutputFile = args[++i];
            break;

         case '--context-file':
            if (i + 1 >= args.length) {
               throw new InvalidParameterError('--context-file requires a filename argument');
            }
            contextOutputFile = args[++i];
            break;

         default:
            throw new InvalidParameterError(`Unknown argument: ${arg}`);
      }
   }

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

   if (rollup && c4DiagramTypes.length === 0) {
      throw new InvalidParameterError('--rollup requires at least one of --c4component or --c4context');
   }

   validateC4OutputFilename(componentOutputFile, '--component-file');
   validateC4OutputFilename(contextOutputFile, '--context-file');

   return {
      rootDir,
      fileSpecs,
      timeWindow: timeWindowFlags[0],
      c4DiagramTypes,
      rollup,
      hasSubdirectorySources: false,
      componentOutputFile,
      contextOutputFile,
      jobStartedAt: new Date()
   };
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
   const options  = parseArgs();
   const directoryReader = new NodeDirectoryReader();
   const fileFilter      = new MinimatchFileFilter();

   if (options.rollup) {
      options.hasSubdirectorySources = await detectSubdirectorySources(
         options.rootDir,
         options.fileSpecs,
         directoryReader,
         fileFilter
      );
   }

   const visitors = VisitorFactory.createAll(options);
   const traverser = new DirectoryTreeTraverser(
      visitors,
      directoryReader,
      fileFilter
   );

   console.log(`Generating docs for: ${options.rootDir}`);
   console.log(`File specs: ${options.fileSpecs.join(', ')}`);
   console.log(`Time window: ${options.timeWindow}`);
   if (options.c4DiagramTypes.length > 0) {
      console.log(`C4 diagram types: ${options.c4DiagramTypes.join(', ')}`);
      console.log(`Component output file: ${options.componentOutputFile}`);
      console.log(`Context output file: ${options.contextOutputFile}`);
   }
   if (options.rollup) {
      console.log('Rollup: enabled');
      if (options.hasSubdirectorySources) {
         console.log('Rollup: root per-directory C4 skipped (nested sources detected)');
      }
   }
   console.log('');

   await traverser.traverse(options);
   console.log('Done.');
}

if (require.main === module) {
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
}
