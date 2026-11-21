import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type * as v from 'valibot';
import 'drizzle-metadata/register';
import '../../metadata';

export type UserId = string & v.Brand<'UserId'>;
export type PostId = string & v.Brand<'PostId'>;

export const users = sqliteTable('users', {
  id: text().primaryKey().$type<UserId>(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  passwordHash: text('password_hash').notNull().meta({ graphqlHidden: true }),
}).meta({ graphqlName: 'User' });

export const posts = sqliteTable('posts', {
  id: text().primaryKey().$type<PostId>(),
  title: text().notNull(),
  authorId: text('author_id')
    .notNull()
    .$type<UserId>()
    .references(() => users.id),
  reviewerId: text('reviewer_id')
    .$type<UserId>()
    .references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().meta({ graphqlHidden: true }),
}).meta({ graphqlName: 'Post' });

export const sessions = sqliteTable('sessions', {
  id: text().primaryKey(),
  userId: text('user_id').notNull(),
}).meta({ graphqlHidden: true });

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts, { relationName: 'author' }),
  sessions: many(sessions),
}));
export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.authorId], references: [users.id], relationName: 'author' }),
  reviewer: one(users, {
    fields: [posts.reviewerId],
    references: [users.id],
    relationName: 'reviewer',
  }),
}));
