import { describe, expect, it } from 'vitest';
import { prepareTxikiRequest } from './prepare-request.lib';

describe('request preparation', () => {
  it('keeps binary clone bodies independently readable and retains request metadata', async () => {
    const prepared = await prepareTxikiRequest(
      new Request('http://localhost/upload?q=1', {
        method: 'POST',
        headers: { 'X-Trace': 'A' },
        body: new Uint8Array([0, 128, 255]),
      }),
    );
    const clone = prepared.clone();
    expect(prepared.url).toBe('http://localhost/upload?q=1');
    expect(prepared.method).toBe('POST');
    expect(clone.headers.get('X-Trace')).toBe('A');
    expect([...new Uint8Array(await clone.arrayBuffer())]).toEqual([0, 128, 255]);
    expect([...new Uint8Array(await prepared.arrayBuffer())]).toEqual([0, 128, 255]);
    expect(() => prepared.clone()).toThrow('consumed');
  });
});
