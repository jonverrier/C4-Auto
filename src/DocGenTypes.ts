/**
 * @module DocGenTypes
 * Shared interfaces, enums, and constants for the automatic documentation generator.
 * Defines the options structure, visitor pattern interfaces, and I/O abstractions
 * used across all components of the doc-gen tool.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// This module defines the shared contracts for an automatic documentation generator. It centralizes option shapes, visitor protocol, and filesystem abstractions so components can interoperate and be tested in isolation.
//
// It exports enums for common configuration: ETimeWindow selects the staleness window used to decide when to regenerate files; EC4DiagramType lists supported C4 diagram outputs (component and context); EVisitorPriority controls execution order of directory visitors, with lower numbers running first.
//
// IDocGenOptions carries parsed CLI settings: rootDir, fileSpecs, selected timeWindow, chosen c4DiagramTypes (empty means no diagrams), and jobStartedAt for staleness checks.
//
// Filesystem and matching are abstracted for mocking: IDirectoryReader lists directory entries and tests for directories; IFileFilter matches filenames against glob specs; IFileReader reads file contents; IFileWriter writes contents.
//
// IDirectoryVisitor defines the visitor pattern for per-directory processing with priority, interested fileSpecs, and an async visit callback receiving the directory path, matching file paths, and options.
//
// The module has no external imports; it provides pure type contracts used by the traverser and visitors.
// ===End StrongAI Generated Comment===

/**
 * Time window controlling which files are considered stale and need regeneration.
 */
export enum ETimeWindow {
   kOneWeek  = 'kOneWeek',
   kTwoWeeks = 'kTwoWeeks',
   kOneMonth = 'kOneMonth'
}

/**
 * Types of C4 architecture diagrams that can be generated.
 */
export enum EC4DiagramType {
   kComponent = 'kComponent',
   kContext   = 'kContext'
}

/**
 * Priority order for directory visitors. Lower number = runs first.
 * kFirst: module header comment visitor
 * kSecond: C4 diagram visitor (runs after headers are up-to-date)
 */
export enum EVisitorPriority {
   kFirst  = 1,
   kSecond = 2,
   kThird  = 3,
   kFourth = 4
}

/**
 * Options parsed from the command line, passed to traverser and visitors.
 * @property rootDir - Root directory to traverse
 * @property fileSpecs - Glob-style file specs, e.g. ['*.ts', '*.tsx']
 * @property timeWindow - Staleness window: regenerate files older than this
 * @property c4DiagramTypes - Which C4 diagram types to generate (empty = none)
 * @property rollup - When true, synthesize root-level README files from subdirectory docs
 * @property jobStartedAt - Timestamp when the job was started, used for staleness checks
 */
export interface IDocGenOptions {
   rootDir: string;
   fileSpecs: string[];
   timeWindow: ETimeWindow;
   c4DiagramTypes: EC4DiagramType[];
   rollup: boolean;
   jobStartedAt: Date;
}

/**
 * Abstraction over the filesystem directory listing, enabling test mocking.
 */
export interface IDirectoryReader {
   /**
    * Lists all entries (files and subdirectory names) directly within a directory.
    * @param dirPath - Absolute path to the directory
    * @returns Array of entry names (not full paths)
    */
   listDirectory(dirPath: string): Promise<string[]>;

   /**
    * Returns true if the given path is a directory.
    * @param itemPath - Absolute path to check
    */
   isDirectory(itemPath: string): Promise<boolean>;
}

/**
 * Abstraction over glob-style file matching, enabling test mocking.
 */
export interface IFileFilter {
   /**
    * Returns true if the filename matches any of the provided glob specs.
    * @param filename - Filename only (not a full path)
    * @param specs - Array of glob patterns, e.g. ['*.ts', '*.tsx']
    */
   matches(filename: string, specs: string[]): boolean;
}

/**
 * Abstraction over file reading, enabling test mocking.
 */
export interface IFileReader {
   /**
    * Reads the full text content of a file.
    * @param filePath - Absolute path to the file
    */
   readFile(filePath: string): Promise<string>;
}

/**
 * Abstraction over file writing, enabling test mocking.
 */
export interface IFileWriter {
   /**
    * Writes text content to a file, overwriting if it already exists.
    * @param filePath - Absolute path to the file
    * @param content - Text content to write
    */
   writeFile(filePath: string, content: string): Promise<void>;
}

/**
 * Interface that all directory visitors must implement.
 * Visitors are registered with the DirectoryTreeTraverser and called for each
 * directory that contains matching files.
 */
export interface IDirectoryVisitor {
   /** Controls the order in which visitors are called within a directory. Lower = first. */
   readonly priority: EVisitorPriority;

   /** Glob-style file specs this visitor is interested in. */
   readonly fileSpecs: string[];

   /**
    * Called for each directory that has at least one file matching this visitor's fileSpecs.
    * @param directoryPath - Absolute path to the directory being visited
    * @param filePaths - Absolute paths of the files in this directory that matched fileSpecs
    * @param options - The parsed CLI options for this job
    */
   visit(directoryPath: string, filePaths: string[], options: IDocGenOptions): Promise<void>;

   /**
    * Optional hook invoked once after the full directory tree has been traversed.
    * @param options - The parsed CLI options for this job
    */
   finalize?(options: IDocGenOptions): Promise<void>;
}
