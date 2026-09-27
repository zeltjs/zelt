import type ts from 'typescript';

import type { Span } from './plugin.types';
import type { DeclarationKind, SourceDetail, TsRelationKind } from './snapshot-schema.lib';

export type CoreLocation = {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
};

export type CoreEvidence = { readonly location: CoreLocation; readonly expression: string };

export type CoreRelation = {
  readonly ownerId: string;
  readonly to: string;
  readonly kind: TsRelationKind;
  readonly evidence: readonly CoreEvidence[];
};

export type CoreDeclaration = {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly kind: DeclarationKind;
  readonly enclosingDeclarationId: string | null;
  readonly source: SourceDetail;
  /** start offset of the declaration; gives the source order inside a group */
  readonly position: number;
};

export type CoreGroup = {
  readonly id: string;
  readonly name: string;
  readonly kind: 'class' | 'file' | 'interface';
  readonly filePath: string;
  readonly expansion: 'included' | 'boundary';
  readonly source: SourceDetail;
  readonly position: number;
};

/** 索引が持つ所在と原文。plugin はこれで label と根拠を作るので AST を歩かなくてよい */
export type CoreSourceSite = {
  readonly span: Span;
  /** span の1行目。複数行の式でも label は1行に収める */
  readonly text: string;
};

export type CoreDeclarationSite = CoreSourceSite & {
  /** 地図に載らない(ignore・未収録)相手は null */
  readonly id: string | null;
};

/** コアが線にしない式。setup の材料になる(付録D) */
export type SetupSiteKind = 'parameter-default' | 'decorator' | 'extends' | 'implements';

export type CoreSetupSite = CoreSourceSite & { readonly kind: SetupSiteKind };

/** module の export 1件。runtime が返す ClassSource と同じ形 */
export type ExportRef = { readonly filePath: string; readonly exportName: string };

/**
 * The part of the index a plugin needs to talk about the same subjects as core.
 * Resolving a whitelisted library member registers its boundary box, so a box
 * appears exactly when some line points at it (4.2).
 */
export type CoreResolver = {
  /** facts as they stand now; call again after a plugin resolved new boundary boxes */
  readonly facts: () => CoreFacts;
  readonly subjectOf: (node: ts.Node) => string | null;
  /** id of the nearest enclosing declaration/group of an arbitrary node */
  readonly ownerOf: (node: ts.Node) => string | null;
  readonly exportsOf: (specifier: string, names: readonly string[]) => readonly ts.Declaration[];
  readonly spanOf: (node: ts.Node, start?: number, end?: number) => Span;
  readonly relativePath: (fileName: string) => string;
  /** module の export が指す宣言 */
  readonly exportSite: (ref: ExportRef) => CoreDeclarationSite | null;
  /** export された class の member(`use`・`constructor` など) */
  readonly memberSite: (ref: ExportRef, member: string) => CoreDeclarationSite | null;
  /** 宣言に書かれた decorator・継承・既定値の所在と原文 */
  readonly setupSites: (id: string) => readonly CoreSetupSite[];
  /** class を値として書いた箇所。コアは線にしないが、所在は事実として残っている */
  readonly mentionSites: (ownerId: string, ref: ExportRef) => readonly CoreSourceSite[];
};

/** 組立が読む事実だけ。索引の解決 API は持たない */
export type SourceFacts = {
  readonly groups: readonly CoreGroup[];
  readonly declarations: readonly CoreDeclaration[];
  readonly relations: readonly CoreRelation[];
  readonly inspectedFiles: readonly string[];
};

export type CoreFacts = SourceFacts & { readonly resolver: CoreResolver };

/** 線の宛先。interface の member は contract として区別する */
export type Target = { readonly id: string; readonly isInterfaceMember: boolean };

/** 根拠を足しながら組み立てる途中の線 */
export type MutableRelation = {
  readonly ownerId: string;
  readonly to: string;
  readonly kind: TsRelationKind;
  readonly evidence: CoreEvidence[];
};
