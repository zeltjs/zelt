import { Controller } from '@zeltjs/core';

import type { PortableBox } from './portable-box.types';
import type { PortableUser } from './portable-user.types';

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
