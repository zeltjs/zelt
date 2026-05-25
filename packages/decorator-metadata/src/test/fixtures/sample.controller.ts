import { createClassDecorator, createMethodDecorator, createPropertyDecorator } from '../../index';

export type UserId = string;

export type User = {
  id: UserId;
  name: string;
  email?: string | undefined;
};

type InternalRole = 'admin' | 'user';

const _useInternalRole = (_role: InternalRole): void => {};
void _useInternalRole;

@createClassDecorator({ basePath: '/users' })
export class UserController {
  /** @throws {E} */
  @createMethodDecorator({ method: 'GET', path: '/:id' })
  getUser(_id: UserId): Promise<User | null> {
    return Promise.resolve(null);
  }

  /** @throws {E} */
  @createMethodDecorator({ method: 'POST', path: '/' })
  createUser(data: Pick<User, 'name' | 'email'>): User {
    return { id: '1', name: data.name, email: data.email };
  }
}

@createClassDecorator({ basePath: '/entities' })
export class Entity {
  @createPropertyDecorator({ nullable: false })
  name!: string;

  @createPropertyDecorator({ nullable: true })
  description?: string;
}
