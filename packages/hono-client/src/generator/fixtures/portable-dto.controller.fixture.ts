import { Controller } from '@zeltjs/core';

import type { PortableBox } from './portable-box.fixture';
import type { PortableUser } from './portable-user.fixture';

@Controller('/portable-dto')
export class PortableDtoController {
  show(): PortableBox<PortableUser> {
    return {
      value: {
        id: '1',
        profile: { bio: 'test' },
      },
    };
  }
}
