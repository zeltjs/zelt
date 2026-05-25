import { Controller, Get, pathParam, response } from '@zeltjs/core';

// Deep nested URI versioning: version prefix + multi-segment resource path
// with multiple path parameters, mirroring NestJS `/v1/api/users/:id/posts/:postId`.
@Controller('/v1/api/users')
export class DeepNestedV1Controller {
  @Get('/:id/posts/:postId')
  userPost() {
    const id = pathParam('id');
    const postId = pathParam('postId');
    return response().text(`V1 user=${id} post=${postId}`);
  }
}

@Controller('/v2/api/users')
export class DeepNestedV2Controller {
  @Get('/:id/posts/:postId')
  userPost() {
    const id = pathParam('id');
    const postId = pathParam('postId');
    return response().text(`V2 user=${id} post=${postId}`);
  }
}
