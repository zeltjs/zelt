import { Authorized, Controller, currentUser, Get } from '@zeltjs/core';

@Controller('/guards')
export class GuardsController {
  @Authorized()
  @Get('/protected')
  protected() {
    const user = currentUser();
    return { user };
  }

  @Authorized(['admin'])
  @Get('/admin-only')
  adminOnly() {
    return { secret: 'admin data' };
  }

  @Authorized(['editor', 'admin'])
  @Get('/editor-or-admin')
  editorOrAdmin() {
    return { content: 'editable' };
  }
}
