import { createClassDecorator, createMethodDecorator } from '@zeltjs/decorator-metadata';

export type CreateUserRequest = {
  name: string;
  email: string;
  age?: number;
};

export type UserResponse = {
  id: string;
  name: string;
  email: string;
  age: number | null;
  createdAt: string;
};

export type Address = {
  street: string;
  city: string;
  country: string;
  postalCode?: string;
};

export type UserWithAddress = {
  id: string;
  name: string;
  address: Address;
};

export type NestedProfile = {
  bio: string;
  social: {
    twitter?: string;
    github?: string;
    links: Array<{
      name: string;
      url: string;
    }>;
  };
};

export type UserWithProfile = {
  id: string;
  profile: NestedProfile;
};

export type Tag = {
  id: string;
  name: string;
};

export type PostItem = {
  id: string;
  title: string;
  content: string;
  tags: Tag[];
  author: {
    id: string;
    name: string;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type Status = 'active' | 'inactive' | 'pending';

export type UserWithStatus = {
  id: string;
  name: string;
  status: Status;
};

@createClassDecorator({ decorator: 'Controller', basePath: '/users' })
export class TypedUserController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/' })
  list(): UserResponse[] {
    return [];
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/:id' })
  show(): UserResponse {
    return { id: '1', name: 'Test', email: 'test@example.com', age: null, createdAt: '' };
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Post', method: 'POST', path: '/' })
  create(body: CreateUserRequest): UserResponse {
    return { id: '1', name: body.name, email: body.email, age: body.age ?? null, createdAt: '' };
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Put', method: 'PUT', path: '/:id' })
  update(body: CreateUserRequest): UserResponse {
    return { id: '1', name: body.name, email: body.email, age: body.age ?? null, createdAt: '' };
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Delete', method: 'DELETE', path: '/:id' })
  destroy(): void {
    return;
  }
}

@createClassDecorator({ decorator: 'Controller', basePath: '/addresses' })
export class NestedObjectController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/:id' })
  show(): UserWithAddress {
    return { id: '1', name: 'Test', address: { street: '', city: '', country: '' } };
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Post', method: 'POST', path: '/' })
  create(body: UserWithAddress): UserWithAddress {
    return body;
  }
}

@createClassDecorator({ decorator: 'Controller', basePath: '/profiles' })
export class DeepNestedController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/:id' })
  show(): UserWithProfile {
    return {
      id: '1',
      profile: { bio: '', social: { links: [] } },
    };
  }
}

@createClassDecorator({ decorator: 'Controller', basePath: '/posts' })
export class ArrayNestedController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/' })
  list(): PostItem[] {
    return [];
  }

  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/:id' })
  show(): PostItem {
    return { id: '1', title: '', content: '', tags: [], author: { id: '1', name: '' } };
  }
}

@createClassDecorator({ decorator: 'Controller', basePath: '/paginated' })
export class GenericTypeController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/users' })
  listUsers(): PaginatedResponse<UserResponse> {
    return { items: [], total: 0, page: 1, pageSize: 10 };
  }
}

@createClassDecorator({ decorator: 'Controller', basePath: '/status' })
export class UnionLiteralController {
  /** @throws {E} */
  @createMethodDecorator({ decorator: 'Get', method: 'GET', path: '/:id' })
  show(): UserWithStatus {
    return { id: '1', name: 'Test', status: 'active' };
  }
}
