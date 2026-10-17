import { BufferedRequest } from './buffered-request.lib';

/**
 * txiki.js 26.6 clones buffered bodies as streams without duplex and does not tee them.
 * Buffer at the adapter boundary so Zelt can read isolated copies without patching globals.
 * @throws {TypeError} when the incoming body is already consumed
 */
export const prepareTxikiRequest = async (input: Request): Promise<Request> =>
  new BufferedRequest(input, input.body === null ? null : await input.arrayBuffer());
