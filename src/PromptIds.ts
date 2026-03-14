/**
 * @module PromptIds
 * UUID constants identifying each LLM prompt used by the documentation generator.
 * These IDs correspond to entries in Prompts.json.
 */
// Copyright (c) 2025, 2026 Jon Verrier

// ===Start StrongAI Generated Comment (20260219)===
// Defines stable UUID constants for LLM prompts used by the documentation generator. It centralizes the identifiers so callers can reference prompts without hard‑coding strings. Each constant maps to an entry in Prompts.json, which stores the actual prompt text and any metadata. This ensures consistent lookup, caching, analytics, and audit trails across tools that generate documentation.
//
// Exports three identifiers:
// - moduleHeaderCommentPromptId identifies the prompt that produces a module‑level header comment for a TypeScript file.
// - c4ComponentDiagramPromptId identifies the prompt that generates a C4 Component diagram in Mermaid format.
// - c4ContextDiagramPromptId identifies the prompt that generates a C4 Context diagram in Mermaid format.
//
// There are no imports or runtime dependencies. The module provides a single source of truth for prompt IDs and helps avoid typos and drift between code and configuration. Consumers use these constants to fetch the correct prompt content from Prompts.json before calling an LLM. Do not change these UUIDs unless Prompts.json is updated in lockstep.
// ===End StrongAI Generated Comment===

/** Prompt for generating a module-level header comment for a TypeScript file. */
export const moduleHeaderCommentPromptId = 'a1d4e7f2-3b8c-4f0e-9d2a-5c6b7e8f1a2b';

/** Prompt for generating a C4 Component architecture diagram in Mermaid format. */
export const c4ComponentDiagramPromptId  = 'b2e5f8a3-4c9d-5a1f-0e3b-6d7c8f9a2b3c';

/** Prompt for generating a C4 Context architecture diagram in Mermaid format. */
export const c4ContextDiagramPromptId    = 'c3f6a9b4-5d0e-6b2a-1f4c-7e8d9a0b3c4d';
