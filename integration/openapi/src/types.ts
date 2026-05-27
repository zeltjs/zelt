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
