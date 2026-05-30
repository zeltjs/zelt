import { currentUser } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

export type EcUser = { readonly id: number; readonly email: string };

export const requireUser = (): EcUser => {
  const user = currentUser();
  if (!user) throw new HTTPException(401, { message: 'Not authenticated' });
  return user as EcUser;
};
