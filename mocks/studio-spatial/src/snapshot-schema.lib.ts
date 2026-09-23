import { array, boolean, intersect, literal, null_, number, object, string, union } from 'valibot';

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
  literal('schema'),
  literal('table'),
  literal('value'),
  literal('event-type'),
]);

export const RelationKindSchema = union([
  literal('call'),
  literal('read'),
  literal('contract'),
  literal('type'),
  literal('schema'),
  literal('table'),
  literal('middleware'),
  literal('event'),
  literal('register'),
  literal('extends'),
  literal('implements'),
  literal('override'),
  literal('returns'),
  literal('construct'),
]);

export const SourceLocationSchema = object({
  filePath: string(),
  startLine: number(),
  endLine: number(),
});

export const RelationEvidenceSchema = object({
  location: SourceLocationSchema,
  expression: string(),
});

export const SourceRelationSchema = object({
  id: RelationIdSchema,
  to: SubjectIdSchema,
  kind: RelationKindSchema,
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
        setup: UnitSetupSchema,
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
  enclosingDeclarationId: union([DeclarationIdSchema, null_()]),
  relations: array(SourceRelationSchema),
  source: SourceDetailSchema,
  unitTests: UnitTestsSchema,
  e2eTests: union([EndpointTestsSchema, null_()]),
  unresolved: array(UnresolvedReferenceSchema),
  hints: array(HintSchema),
});

export const GroupPresentationSchema = object({
  columnId: ColumnIdSchema,
  role: union([literal('regular'), literal('config'), literal('composition')]),
});

export const SourceGroupSchema = object({
  id: GroupIdSchema,
  name: string(),
  kind: union([literal('class'), literal('file'), literal('interface')]),
  filePath: string(),
  members: array(SourceDeclarationSchema),
  relations: array(SourceRelationSchema),
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
