import { currentUser } from '@zeltjs/core';
import { HTTPException } from 'hono/http-exception';

import type { EcUser } from '../../domain/user.types';

export const requireUser = (): EcUser => {
  const user = currentUser();
  if (!user) throw new HTTPException(401, { message: 'Not authenticated' });
  return user as EcUser;
};
