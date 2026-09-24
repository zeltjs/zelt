import type { InferOutput } from 'valibot';
import type {
  AssociationCoverageSchema,
  ClassReferenceSchema,
  ColumnIdSchema,
  DeclarationIdSchema,
  DeclarationKindSchema,
  DependencyBindingSchema,
  EndpointCoverageSchema,
  EndpointTestCaseSchema,
  EndpointTestsSchema,
  GrantedRelationSchema,
  GroupIdSchema,
  GroupPresentationSchema,
  HintSchema,
  MapPresentationSchema,
  MeaningSchema,
  RelationEvidenceSchema,
  RelationIdSchema,
  SetupIdSchema,
  SetupItemSchema,
  SourceDeclarationSchema,
  SourceDetailSchema,
  SourceGraphSchema,
  SourceGroupSchema,
  SourceLocationSchema,
  SourceRelationSchema,
  StudioSnapshotSchema,
  SubjectIdSchema,
  TestIdentitySchema,
  TestIdSchema,
  TsRelationKindSchema,
  TsRelationSchema,
  UnitSetupSchema,
  UnitTestCaseSchema,
  UnitTestsSchema,
  UnresolvedReferenceSchema,
} from './snapshot-schema.lib';

export type GroupId = InferOutput<typeof GroupIdSchema>;
export type DeclarationId = InferOutput<typeof DeclarationIdSchema>;
export type SubjectId = InferOutput<typeof SubjectIdSchema>;
export type RelationId = InferOutput<typeof RelationIdSchema>;
export type TestId = InferOutput<typeof TestIdSchema>;
export type SetupId = InferOutput<typeof SetupIdSchema>;
export type ColumnId = InferOutput<typeof ColumnIdSchema>;
export type StudioSnapshot = InferOutput<typeof StudioSnapshotSchema>;
export type SourceGraph = InferOutput<typeof SourceGraphSchema>;
export type SourceGroup = InferOutput<typeof SourceGroupSchema>;
export type DeclarationKind = InferOutput<typeof DeclarationKindSchema>;
export type SourceDeclaration = InferOutput<typeof SourceDeclarationSchema>;
export type TsRelationKind = InferOutput<typeof TsRelationKindSchema>;
export type TsRelation = InferOutput<typeof TsRelationSchema>;
export type GrantedRelation = InferOutput<typeof GrantedRelationSchema>;
export type Meaning = InferOutput<typeof MeaningSchema>;
export type SetupItem = InferOutput<typeof SetupItemSchema>;
export type SourceRelation = InferOutput<typeof SourceRelationSchema>;
export type SourceLocation = InferOutput<typeof SourceLocationSchema>;
export type RelationEvidence = InferOutput<typeof RelationEvidenceSchema>;
export type UnresolvedReference = InferOutput<typeof UnresolvedReferenceSchema>;
export type SourceDetail = InferOutput<typeof SourceDetailSchema>;
export type UnitTests = InferOutput<typeof UnitTestsSchema>;
export type UnitTestCase = InferOutput<typeof UnitTestCaseSchema>;
export type EndpointTests = InferOutput<typeof EndpointTestsSchema>;
export type EndpointTestCase = InferOutput<typeof EndpointTestCaseSchema>;
export type TestIdentity = InferOutput<typeof TestIdentitySchema>;
export type ClassReference = InferOutput<typeof ClassReferenceSchema>;
export type DependencyBinding = InferOutput<typeof DependencyBindingSchema>;
export type UnitSetup = InferOutput<typeof UnitSetupSchema>;
export type AssociationCoverage = InferOutput<typeof AssociationCoverageSchema>;
export type EndpointCoverage = InferOutput<typeof EndpointCoverageSchema>;
export type GroupPresentation = InferOutput<typeof GroupPresentationSchema>;
export type Hint = InferOutput<typeof HintSchema>;
export type MapPresentation = InferOutput<typeof MapPresentationSchema>;
