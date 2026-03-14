/**
 * @module VisitorFactory
 * Static factory that constructs production-wired IDirectoryVisitor instances
 * and provides production implementations of IFileReader and IFileWriter.
 * Call VisitorFactory.createAll(options) from the CLI entry point to obtain
 * the full visitor list ready for the DirectoryTreeTraverser.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// This module builds the production visitor set for a documentation generation run and provides file I/O adapters. It exports three classes. NodeFileReader implements IFileReader using Node's fs/promises to read UTF-8 files. NodeFileWriter implements IFileWriter using fs/promises to write UTF-8 files. VisitorFactory creates and wires IDirectoryVisitor instances that other parts of the system, such as DirectoryTreeTraverser, can execute.
//
// VisitorFactory.createAll takes IDocGenOptions and returns an array of visitors. It always includes ModuleHeaderVisitor to generate module headers. It conditionally adds C4DiagramVisitor when options.c4DiagramTypes is non-empty, passing through the requested diagram types. The factory constructs shared dependencies once and injects them into each visitor: a NodeFileReader, a NodeFileWriter, a PromptInMemoryRepository seeded with Prompts.json, and a chat driver created by ChatDriverFactory. The chat driver targets EModel.kLarge on EModelProvider.kOpenAI.
//
// Key imports include fs/promises for file access, prompt-repository symbols (IPrompt, EModel, EModelProvider, PromptInMemoryRepository, ChatDriverFactory) for LLM prompts and chat execution, and local types and visitors for consistent wiring.
// ===End StrongAI Generated Comment===


import * as fs from 'fs/promises';
import {
   IPrompt,
   EModel,
   EModelProvider,
   PromptInMemoryRepository,
   ChatDriverFactory
} from '@jonverrier/prompt-repository';

import { IDocGenOptions, IDirectoryVisitor, IFileReader, IFileWriter } from './DocGenTypes';
import { ModuleHeaderVisitor } from './ModuleHeaderVisitor';
import { C4DiagramVisitor } from './C4DiagramVisitor';
import typedPrompts from './Prompts.json';

/**
 * Production implementation of IFileReader using Node.js fs/promises.
 */
export class NodeFileReader implements IFileReader {
   async readFile(filePath: string): Promise<string> {
      return fs.readFile(filePath, 'utf8');
   }
}

/**
 * Production implementation of IFileWriter using Node.js fs/promises.
 */
export class NodeFileWriter implements IFileWriter {
   async writeFile(filePath: string, content: string): Promise<void> {
      await fs.writeFile(filePath, content, 'utf8');
   }
}

/**
 * Factory that creates and wires all visitors for a doc-gen job.
 * Always includes ModuleHeaderVisitor.
 * Includes C4DiagramVisitor when options.c4DiagramTypes is non-empty.
 */
export class VisitorFactory {
   /**
    * Creates the full set of visitors for the given options.
    * All dependencies (chat driver, prompt repo, file I/O) are wired to
    * their production implementations.
    *
    * @param options - The parsed doc-gen options
    * @returns Array of visitors ready to be passed to DirectoryTreeTraverser
    */
   static createAll(options: IDocGenOptions): IDirectoryVisitor[] {
      const fileReader = new NodeFileReader();
      const fileWriter = new NodeFileWriter();
      const promptRepo = new PromptInMemoryRepository(typedPrompts as IPrompt[]);
      // EModel.kLarge maps to gpt-4o (OpenAI's flagship model) via @jonverrier/prompt-repository.
      const chatDriver = new ChatDriverFactory().create(EModel.kLarge, EModelProvider.kOpenAI);

      const visitors: IDirectoryVisitor[] = [
         new ModuleHeaderVisitor(fileReader, fileWriter, chatDriver, promptRepo)
      ];

      if (options.c4DiagramTypes.length > 0) {
         visitors.push(
            new C4DiagramVisitor(fileReader, fileWriter, chatDriver, promptRepo, options.c4DiagramTypes)
         );
      }

      return visitors;
   }
}
