import type { InferOutput } from 'valibot';
import type {
  ClassReferenceSchema,
  DeclarationKindSchema,
  EndpointTestsSchema,
  GrantedRelationSchema,
  HintSchema,
  MeaningSchema,
  SetupItemSchema,
  SourceDeclarationSchema,
  SourceDetailSchema,
  SourceGroupSchema,
  SourceRelationSchema,
  StudioSnapshotSchema,
  TsRelationKindSchema,
  TsRelationSchema,
  UnitSetupSchema,
  UnitTestsSchema,
} from './snapshot-schema.lib';

export type StudioSnapshot = InferOutput<typeof StudioSnapshotSchema>;
export type SourceGroup = InferOutput<typeof SourceGroupSchema>;
export type SourceDeclaration = InferOutput<typeof SourceDeclarationSchema>;
export type DeclarationKind = InferOutput<typeof DeclarationKindSchema>;
export type TsRelationKind = InferOutput<typeof TsRelationKindSchema>;
export type TsRelation = InferOutput<typeof TsRelationSchema>;
export type GrantedRelation = InferOutput<typeof GrantedRelationSchema>;
export type Meaning = InferOutput<typeof MeaningSchema>;
export type SetupItem = InferOutput<typeof SetupItemSchema>;
export type SourceRelation = InferOutput<typeof SourceRelationSchema>;
export type SourceDetail = InferOutput<typeof SourceDetailSchema>;
export type UnitTests = InferOutput<typeof UnitTestsSchema>;
export type EndpointTests = InferOutput<typeof EndpointTestsSchema>;
export type ClassReference = InferOutput<typeof ClassReferenceSchema>;
export type UnitSetup = InferOutput<typeof UnitSetupSchema>;
export type Hint = InferOutput<typeof HintSchema>;
