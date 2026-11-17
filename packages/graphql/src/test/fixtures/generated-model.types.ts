import type * as v from 'valibot';
import type { ID } from '../../index';

export type UserId = string & Readonly<{ __brand: 'UserId' }>;
export type PostId = string & v.Brand<'PostId'>;
export type Score = number & v.Brand<'Score'>;
export type Label = string & Readonly<{ __brand: 'Label' }>;

export interface GeneratedUser {
  readonly id: ID<UserId>;
  readonly firstName: Label;
  readonly aliases: readonly (Label | null)[] | null;
  readonly $passwordHash: string;
  readonly posts: readonly GeneratedPost[];
}

export interface GeneratedPost {
  readonly id: ID<PostId>;
  readonly score: Score | null;
  readonly scores: readonly Score[];
  readonly $createdAt: Date;
  readonly $authorId: UserId;
  readonly author: GeneratedUser;
}
