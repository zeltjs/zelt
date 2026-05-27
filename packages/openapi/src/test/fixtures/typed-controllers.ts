import { Controller, Delete, Get, Post, Put } from '@zeltjs/core';

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

@Controller('/users')
export class TypedUserController {
  /** @throws {E} */
  @Get('/')
  list(): UserResponse[] {
    return [];
  }

  /** @throws {E} */
  @Get('/:id')
  show(): UserResponse {
    return { id: '1', name: 'Test', email: 'test@example.com', age: null, createdAt: '' };
  }

  /** @throws {E} */
  @Post('/')
  create(body: CreateUserRequest): UserResponse {
    return { id: '1', name: body.name, email: body.email, age: body.age ?? null, createdAt: '' };
  }

  /** @throws {E} */
  @Put('/:id')
  update(body: CreateUserRequest): UserResponse {
    return { id: '1', name: body.name, email: body.email, age: body.age ?? null, createdAt: '' };
  }

  /** @throws {E} */
  @Delete('/:id')
  destroy(): void {
    return;
  }
}

@Controller('/addresses')
export class NestedObjectController {
  /** @throws {E} */
  @Get('/:id')
  show(): UserWithAddress {
    return { id: '1', name: 'Test', address: { street: '', city: '', country: '' } };
  }

  /** @throws {E} */
  @Post('/')
  create(body: UserWithAddress): UserWithAddress {
    return body;
  }
}

@Controller('/profiles')
export class DeepNestedController {
  /** @throws {E} */
  @Get('/:id')
  show(): UserWithProfile {
    return {
      id: '1',
      profile: { bio: '', social: { links: [] } },
    };
  }
}

@Controller('/posts')
export class ArrayNestedController {
  /** @throws {E} */
  @Get('/')
  list(): PostItem[] {
    return [];
  }

  /** @throws {E} */
  @Get('/:id')
  show(): PostItem {
    return { id: '1', title: '', content: '', tags: [], author: { id: '1', name: '' } };
  }
}

@Controller('/paginated')
export class GenericTypeController {
  /** @throws {E} */
  @Get('/users')
  listUsers(): PaginatedResponse<UserResponse> {
    return { items: [], total: 0, page: 1, pageSize: 10 };
  }
}

@Controller('/status')
export class UnionLiteralController {
  /** @throws {E} */
  @Get('/:id')
  show(): UserWithStatus {
    return { id: '1', name: 'Test', status: 'active' };
  }
}
