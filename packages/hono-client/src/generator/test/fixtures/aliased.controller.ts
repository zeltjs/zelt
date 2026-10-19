import { Controller } from '@zeltjs/core';

@Controller('/alias')
class InternalController {
  show(): { id: string } {
    return { id: 'alias' };
  }
}

export { InternalController as PublicController };

@Controller('/default')
export default class DefaultController {
  show(): { id: string } {
    return { id: 'default' };
  }
}

/** @throws {E} */
export const hiddenController = () => {
  @Controller('/hidden')
  class HiddenController {
    show() {
      return 'hidden';
    }
  }
  return HiddenController;
};
