import { Injectable, inject } from '@zeltjs/core';
import { NOT_EXIST, stage, withStagingScope } from '@zeltjs/drizzle-repository';
import { err } from 'neverthrow';

import { UserRepositoryBase } from '../db/generated/user.repository-base';
import type { UserExistedId, UserId } from '../domain/generated/user.model';
import { UserCommandRepository, UserQueryRepository } from './user.repository';

// Parts of the app the examples leave out.
declare const rejected: (reason: string) => unknown;
declare const newUserId: () => UserId;

@Injectable()
export class UserExamples {
  private readonly users = inject(UserQueryRepository);
  private readonly userCommands = inject(UserCommandRepository);

  async readById(input: { user_id: UserId }) {
    const existed = await this.users.isExisted(input.user_id);
    if (existed.isErr()) return err(existed.error);
    if (existed.value === NOT_EXIST) return rejected('not_found');

    const user = await this.users.getById(existed.value);
    return user;
  }

  async checkEmail(input: { email: string }) {
    const checked = await this.users.isExistedByEmail(input.email);
    if (checked.isErr()) return err(checked.error);

    if (checked.value.id === NOT_EXIST) {
      // No row has this email.
    } else {
      // A row has this email.
    }
    return checked;
  }

  async create(email: string) {
    const created = await this.userCommands.save({
      pre: null,
      input: { id: newUserId(), name: 'Alice', email },
    });
    if (created.isErr()) return err(created.error);

    return created;
  }

  async rename(userExistedId: UserExistedId) {
    const user = await this.users.getById(userExistedId);
    if (user.isErr()) return err(user.error);

    const saved = await this.userCommands.save({
      pre: user.value,
      input: { ...user.value, name: 'Bob' },
    });
    if (saved.isErr()) return err(saved.error);
    return saved;
  }

  async remove(userExistedId: UserExistedId) {
    const user = await this.users.getById(userExistedId);
    if (user.isErr()) return err(user.error);

    const deleted = await this.userCommands.delete(user.value);
    if (deleted.isErr()) return err(deleted.error);
    return deleted;
  }

  async importUsers(rows: readonly { readonly name: string; readonly email: string }[]) {
    await withStagingScope(async () => {
      for (const row of rows) {
        const checked = await this.users.isExistedByEmail(row.email);
        if (checked.isErr()) return err(checked.error);
        if (checked.value.id !== NOT_EXIST) continue;

        const staged = stage(UserRepositoryBase.staging, {
          pre: null,
          input: { id: newUserId(), name: row.name, email: row.email },
        });
        if (staged.isErr()) return err(staged.error);
      }
    });
  }
}
