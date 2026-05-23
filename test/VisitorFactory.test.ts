/**
 * @module VisitorFactory.test
 * Contract tests for production visitor wiring and pipeline priority order.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { expect } from 'expect';

import { VisitorFactory } from '../src/VisitorFactory';
import { ModuleHeaderVisitor } from '../src/ModuleHeaderVisitor';
import { C4DiagramVisitor } from '../src/C4DiagramVisitor';
import { RollupC4Visitor } from '../src/RollupC4Visitor';
import { EC4DiagramType, EVisitorPriority } from '../src/DocGenTypes';
import { makeTestDocGenOptions } from './testDocGenOptions';

describe('VisitorFactory.createAll', () => {
   it('includes ModuleHeaderVisitor alone when no diagram types are requested', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions());

      expect(visitors).toHaveLength(1);
      expect(visitors[0]).toBeInstanceOf(ModuleHeaderVisitor);
      expect(visitors.map(v => v.priority)).toEqual([EVisitorPriority.kFirst]);
   });

   it('orders header and diagram visitors by kFirst then kSecond', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions({
         c4DiagramTypes: [EC4DiagramType.kComponent, EC4DiagramType.kContext]
      }));

      expect(visitors).toHaveLength(2);
      expect(visitors[0]).toBeInstanceOf(ModuleHeaderVisitor);
      expect(visitors[1]).toBeInstanceOf(C4DiagramVisitor);
      expect(visitors.map(v => v.priority)).toEqual([
         EVisitorPriority.kFirst,
         EVisitorPriority.kSecond
      ]);
   });

   it('orders full pipeline as kFirst, kSecond, kThird when rollup is enabled', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions({
         c4DiagramTypes: [EC4DiagramType.kComponent],
         rollup: true
      }));

      expect(visitors).toHaveLength(3);
      expect(visitors[0]).toBeInstanceOf(ModuleHeaderVisitor);
      expect(visitors[1]).toBeInstanceOf(C4DiagramVisitor);
      expect(visitors[2]).toBeInstanceOf(RollupC4Visitor);
      expect(visitors.map(v => v.priority)).toEqual([
         EVisitorPriority.kFirst,
         EVisitorPriority.kSecond,
         EVisitorPriority.kThird
      ]);
   });

   it('returns visitors in ascending priority order', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions({
         c4DiagramTypes: [EC4DiagramType.kContext],
         rollup: true
      }));

      const priorities = visitors.map(v => v.priority);
      for (let i = 1; i < priorities.length; i++) {
         expect(priorities[i]).toBeGreaterThan(priorities[i - 1]!);
      }
   });

   it('omits ModuleHeaderVisitor when skipHeaders is set', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions({
         skipHeaders: true,
         c4DiagramTypes: [EC4DiagramType.kComponent]
      }));

      expect(visitors.every(v => !(v instanceof ModuleHeaderVisitor))).toBe(true);
      expect(visitors[0]).toBeInstanceOf(C4DiagramVisitor);
      expect(visitors.map(v => v.priority)).toEqual([EVisitorPriority.kSecond]);
   });

   it('still includes RollupC4Visitor at kThird in diagrams-only mode', () => {
      const visitors = VisitorFactory.createAll(makeTestDocGenOptions({
         skipHeaders: true,
         c4DiagramTypes: [EC4DiagramType.kComponent],
         rollup: true
      }));

      expect(visitors).toHaveLength(2);
      expect(visitors[0]).toBeInstanceOf(C4DiagramVisitor);
      expect(visitors[1]).toBeInstanceOf(RollupC4Visitor);
      expect(visitors.map(v => v.priority)).toEqual([
         EVisitorPriority.kSecond,
         EVisitorPriority.kThird
      ]);
   });
});
