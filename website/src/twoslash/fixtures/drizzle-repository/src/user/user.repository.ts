import { Injectable, inject } from '@zeltjs/core';

import { UserRepositoryBase } from '../db/generated/user.repository-base';

@Injectable()
export class UserQueryRepository {
  private readonly base = inject(UserRepositoryBase);
  public isExisted = this.base.isExisted.bind(this.base);
  public getById = this.base.getById.bind(this.base);
  public isExistedByEmail = this.base.isExistedByEmail.bind(this.base);
}

@Injectable()
export class UserCommandRepository {
  private readonly base = inject(UserRepositoryBase);
  public save = this.base.save.bind(this.base);
  public delete = this.base.delete.bind(this.base);
}
