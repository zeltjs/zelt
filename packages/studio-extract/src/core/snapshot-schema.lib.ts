// この JSON 契約の SoT。抽出器(node)とブラウザ UI(@zeltjs/studio-ui)の両方がここだけを読むため、
// node/typescript を引き込まない葉モジュールに保ち、`@zeltjs/studio-extract/snapshot` で公開する。
// 型も valibot schema から導出したものをここで export する(UI 側に写しを作らない)。
import type { InferOutput } from 'valibot';
import {
  array,
  boolean,
  intersect,
  literal,
  null_,
  number,
  object,
  string,
  union,
  variant,
} from 'valibot';

export const GroupIdSchema = string();

export const DeclarationIdSchema = string();

export const SubjectIdSchema = union([GroupIdSchema, DeclarationIdSchema]);

export const RelationIdSchema = string();

export const TestIdSchema = string();

export const SetupIdSchema = string();

export const ColumnIdSchema = string();

export const DeclarationKindSchema = union([
  literal('method'),
  literal('constructor'),
  literal('function'),
  literal('callback'),
  literal('property'),
  literal('getter'),
  literal('signature'),
  literal('type'),
  literal('value'),
]);

export const TsRelationKindSchema = union([
  literal('call'),
  literal('read'),
  literal('contract'),
  literal('type'),
  literal('extends'),
  literal('implements'),
  literal('override'),
  literal('construct'),
]);

// A library meaning a plugin granted to a TS fact; the fact's own kind stays unchanged.
export const MeaningSchema = object({
  provider: string(),
  kind: string(),
});

export const SourceLocationSchema = object({
  filePath: string(),
  startLine: number(),
  endLine: number(),
});

export const RelationEvidenceSchema = object({
  location: SourceLocationSchema,
  expression: string(),
});

export const TsRelationSchema = object({
  id: RelationIdSchema,
  origin: literal('ts'),
  to: SubjectIdSchema,
  kind: TsRelationKindSchema,
  meanings: array(MeaningSchema),
  evidence: array(RelationEvidenceSchema),
});

// A relation TS cannot show (middleware, event delivery, app registration), granted by a plugin.
export const GrantedRelationSchema = object({
  id: RelationIdSchema,
  origin: literal('plugin'),
  to: SubjectIdSchema,
  provider: string(),
  kind: string(),
  // Where this relation sits in the chain the request runs through (0-based).
  // null when the granted relation has no runtime order.
  order: union([number(), null_()]),
  evidence: array(RelationEvidenceSchema),
});

export const SourceRelationSchema = variant('origin', [TsRelationSchema, GrantedRelationSchema]);

// How parts are assembled (inject, middleware, config override); shown in details, not as a flow.
export const SetupItemSchema = object({
  provider: string(),
  kind: string(),
  label: string(),
  target: union([SubjectIdSchema, null_()]),
  evidence: array(RelationEvidenceSchema),
});

export const SourceDetailSchema = object({
  location: SourceLocationSchema,
  signature: string(),
  excerpt: union([
    object({
      kind: literal('code'),
      text: string(),
    }),
    object({
      kind: literal('declaration-only'),
    }),
  ]),
});

export const ClassReferenceSchema = object({
  filePath: string(),
  name: string(),
});

export const DependencyBindingSchema = object({
  provide: ClassReferenceSchema,
  kind: union([literal('service'), literal('config')]),
});

export const UnitSetupSchema = intersect([
  object({
    id: SetupIdSchema,
    targetClass: ClassReferenceSchema,
    location: SourceLocationSchema,
  }),
  union([
    object({
      resolution: literal('resolved'),
      dependencies: array(DependencyBindingSchema),
      configs: array(ClassReferenceSchema),
      overrides: array(
        object({
          provide: ClassReferenceSchema,
        }),
      ),
    }),
    object({
      resolution: literal('unresolved'),
      reason: union([
        literal('dynamic-setup'),
        literal('unresolved-provider'),
        literal('not-collected'),
      ]),
    }),
  ]),
]);

export const TestIdentitySchema = object({
  id: TestIdSchema,
  name: string(),
  suite: array(string()),
  location: SourceLocationSchema,
});

export const UnitTestCaseSchema = intersect([
  TestIdentitySchema,
  object({
    calls: array(
      object({
        // null: the case called a module function directly, without a DI container.
        setup: union([UnitSetupSchema, null_()]),
        invocation: SourceLocationSchema,
      }),
    ),
  }),
]);

export const AssociationCoverageSchema = object({
  status: union([literal('complete-in-scope'), literal('partial'), literal('uncollected')]),
  searchScope: array(string()),
  inspectedFiles: array(string()),
});

export const UnitTestsSchema = object({
  cases: array(UnitTestCaseSchema),
  coverage: AssociationCoverageSchema,
});

export const EndpointTestCaseSchema = intersect([
  TestIdentitySchema,
  object({
    requests: array(
      object({
        location: SourceLocationSchema,
        via: union([literal('direct'), literal('helper')]),
      }),
    ),
  }),
]);

export const EndpointCoverageSchema = intersect([
  AssociationCoverageSchema,
  object({
    includesSharedSetup: boolean(),
  }),
]);

export const EndpointTestsSchema = object({
  cases: array(EndpointTestCaseSchema),
  coverage: EndpointCoverageSchema,
});

export const UnresolvedReferenceSchema = object({
  evidence: RelationEvidenceSchema,
  reason: union([
    literal('dynamic-access'),
    literal('external-boundary'),
    literal('stored-function-reference'),
    literal('parameter-callback'),
    literal('symbol-unresolved'),
  ]),
});

export const HintSchema = object({
  provider: string(),
  label: string(),
});

export const SourceDeclarationSchema = object({
  id: DeclarationIdSchema,
  name: string(),
  kind: DeclarationKindSchema,
  meanings: array(MeaningSchema),
  enclosingDeclarationId: union([DeclarationIdSchema, null_()]),
  relations: array(SourceRelationSchema),
  setup: array(SetupItemSchema),
  source: SourceDetailSchema,
  unitTests: UnitTestsSchema,
  e2eTests: union([EndpointTestsSchema, null_()]),
  unresolved: array(UnresolvedReferenceSchema),
  hints: array(HintSchema),
});

export const GroupPresentationSchema = object({
  columnId: ColumnIdSchema,
});

export const SourceGroupSchema = object({
  id: GroupIdSchema,
  name: string(),
  kind: union([literal('class'), literal('file'), literal('interface')]),
  filePath: string(),
  members: array(SourceDeclarationSchema),
  relations: array(SourceRelationSchema),
  setup: array(SetupItemSchema),
  expansion: union([literal('included'), literal('boundary')]),
  source: SourceDetailSchema,
  unresolved: array(UnresolvedReferenceSchema),
  hints: array(HintSchema),
  presentation: GroupPresentationSchema,
});

export const MapPresentationSchema = object({
  id: string(),
  columns: array(
    object({
      id: ColumnIdSchema,
      label: string(),
      width: number(),
      initiallyHidden: boolean(),
    }),
  ),
});

export const SourceGraphSchema = object({
  groups: array(SourceGroupSchema),
  presentation: MapPresentationSchema,
});

export const StudioSnapshotSchema = object({
  schemaVersion: literal(1),
  snapshotId: string(),
  project: object({
    id: string(),
    name: string(),
  }),
  provenance: union([literal('manual-fixture'), literal('extracted')]),
  graph: SourceGraphSchema,
});

export type StudioSnapshot = InferOutput<typeof StudioSnapshotSchema>;
export type SourceGroup = InferOutput<typeof SourceGroupSchema>;
export type DeclarationKind = InferOutput<typeof DeclarationKindSchema>;
export type SourceDeclaration = InferOutput<typeof SourceDeclarationSchema>;
export type TsRelationKind = InferOutput<typeof TsRelationKindSchema>;
export type GrantedRelation = InferOutput<typeof GrantedRelationSchema>;
export type Meaning = InferOutput<typeof MeaningSchema>;
export type SetupItem = InferOutput<typeof SetupItemSchema>;
export type SourceRelation = InferOutput<typeof SourceRelationSchema>;
export type SourceLocation = InferOutput<typeof SourceLocationSchema>;
export type RelationEvidence = InferOutput<typeof RelationEvidenceSchema>;
export type SourceDetail = InferOutput<typeof SourceDetailSchema>;
export type UnitTests = InferOutput<typeof UnitTestsSchema>;
export type UnitTestCase = InferOutput<typeof UnitTestCaseSchema>;
export type EndpointTests = InferOutput<typeof EndpointTestsSchema>;
export type UnitSetup = InferOutput<typeof UnitSetupSchema>;
export type AssociationCoverage = InferOutput<typeof AssociationCoverageSchema>;
export type Hint = InferOutput<typeof HintSchema>;
export type TsRelation = InferOutput<typeof TsRelationSchema>;
export type ClassReference = InferOutput<typeof ClassReferenceSchema>;
