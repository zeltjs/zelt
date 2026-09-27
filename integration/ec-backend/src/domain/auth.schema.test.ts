import * as v from 'valibot';
import { describe, expect, it } from 'vitest';

import { LoginSchema, RegisterSchema } from './auth.schema';

describe('RegisterSchema', () => {
  it('accepts a valid registration', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    });

    expect(result.success).toBe(true);
    expect(result.output).toEqual({
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
    });
  });

  it('accepts a password of exactly 8 characters', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: '12345678',
      name: 'Alice',
    });

    expect(result.success).toBe(true);
  });

  it('rejects a password shorter than 8 characters', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: '1234567',
      name: 'Alice',
    });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('password');
  });

  it('rejects a malformed email', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'not-an-email',
      password: 'password123',
      name: 'Alice',
    });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('email');
  });

  it('rejects an empty name', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: 'password123',
      name: '',
    });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('name');
  });

  it('rejects when a required field is missing', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(result.success).toBe(false);
  });

  it('rejects a non-string password', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: 12345678,
      name: 'Alice',
    });

    expect(result.success).toBe(false);
  });

  it('drops unknown keys such as role', () => {
    const result = v.safeParse(RegisterSchema, {
      email: 'alice@example.com',
      password: 'password123',
      name: 'Alice',
      role: 'admin',
    });

    expect(result.success).toBe(true);
    expect(result.output).not.toHaveProperty('role');
  });
});

describe('LoginSchema', () => {
  it('accepts a valid login', () => {
    const result = v.safeParse(LoginSchema, {
      email: 'alice@example.com',
      password: 'x',
    });

    expect(result.success).toBe(true);
  });

  it('rejects an empty password', () => {
    const result = v.safeParse(LoginSchema, {
      email: 'alice@example.com',
      password: '',
    });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('password');
  });

  it('rejects a malformed email', () => {
    const result = v.safeParse(LoginSchema, {
      email: 'alice',
      password: 'password123',
    });

    expect(result.success).toBe(false);
    expect(result.issues?.[0]?.path?.[0]?.key).toBe('email');
  });

  it('rejects a missing email', () => {
    const result = v.safeParse(LoginSchema, { password: 'password123' });

    expect(result.success).toBe(false);
  });
});
