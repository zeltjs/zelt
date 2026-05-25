import { accessSync, constants } from 'node:fs';

import { Controller, Get, HTTPException, inject, response } from '@zeltjs/core';

import { FileService } from './file.service';

@Controller('/')
export class FileController {
  constructor(private fileService = inject(FileService)) {}

  @Get('/file/stream')
  getFileFromStream() {
    return response()
      .header('Content-Type', 'application/octet-stream')
      .body(this.fileService.getReadStream());
  }

  @Get('/file/buffer')
  getFileFromBuffer() {
    const buffer = this.fileService.getBuffer();
    return response().header('Content-Type', 'application/octet-stream').body(buffer);
  }

  @Get('/non-file/pipe-method')
  getNonFile() {
    return response().json(this.fileService.getNonFileValue());
  }

  @Get('/file/async/stream')
  async getFileFromAsyncStream() {
    const stream = await this.fileService.getAsyncStream();
    return response().header('Content-Type', 'application/octet-stream').body(stream);
  }

  @Get('/file/with/headers')
  getFileWithHeaders() {
    const file = this.fileService.getFileWithHeaders();
    return response()
      .header('Content-Type', file.type)
      .header('Content-Disposition', file.disposition)
      .header('Content-Length', String(file.length))
      .body(file.stream);
  }

  @Get('/file/not/exist')
  getMissingFile() {
    // Detect the missing file eagerly so we can return a deterministic 400 response,
    // matching the NestJS send-files integration behaviour.
    try {
      accessSync('does-not-exist.txt', constants.R_OK);
    } catch {
      throw new HTTPException(400, { message: 'File does not exist' });
    }
    return response().body(this.fileService.getMissingFileStream());
  }
}
