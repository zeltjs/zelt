import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

import { Injectable } from '@zeltjs/core';

import { README_BUFFER, README_PATH } from './fixtures';

export type FileWithMeta = {
  readonly stream: ReadableStream<Uint8Array>;
  readonly type: string;
  readonly disposition: string;
  readonly length: number;
};

@Injectable()
export class FileService {
  getReadStream(): ReadableStream<Uint8Array> {
    // Convert Node Readable to Web ReadableStream so Hono can stream it through c.body().
    return Readable.toWeb(createReadStream(README_PATH)) as ReadableStream<Uint8Array>;
  }

  getBuffer(): Uint8Array {
    // Return a fresh Uint8Array view so the consumer can't mutate the shared buffer.
    return new Uint8Array(README_BUFFER);
  }

  getNonFileValue(): { value: string } {
    return { value: 'Hello world' };
  }

  async getAsyncStream(): Promise<ReadableStream<Uint8Array>> {
    return this.getReadStream();
  }

  getFileWithHeaders(): FileWithMeta {
    return {
      stream: this.getReadStream(),
      type: 'text/markdown',
      disposition: 'attachment; filename="Readme.md"',
      length: README_BUFFER.byteLength,
    };
  }

  getMissingFileStream(): ReadableStream<Uint8Array> {
    // Lazily error when the consumer starts reading, mirroring fs.createReadStream behaviour.
    return Readable.toWeb(createReadStream('does-not-exist.txt')) as ReadableStream<Uint8Array>;
  }
}
