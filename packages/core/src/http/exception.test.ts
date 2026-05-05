import { describe, expect, it } from 'vitest';
import { HTTPException as HonoHTTPException } from 'hono/http-exception';

import { HTTPException } from '../index';

describe('@zeltjs/core HTTPException re-export', () => {
  it('is the same constructor as hono/http-exception', () => {
    expect(HTTPException).toBe(HonoHTTPException);
  });

  it('has expected fields', () => {
    const err = new HTTPException(404, { message: 'not found' });
    expect(err.status).toBe(404);
    expect(err.message).toBe('not found');
  });
});
