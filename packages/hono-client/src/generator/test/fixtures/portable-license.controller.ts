import { Controller } from '@zeltjs/core';

import type { ValidateSuccess } from './portable-license.types';

@Controller('/license')
export class PortableLicenseController {
  validate(): ValidateSuccess {
    return { status: 'revoked' };
  }
}
