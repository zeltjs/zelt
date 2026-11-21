import { Controller, Get, request } from '@zeltjs/core';

abstract class UndecoratedRoutes {
  readonly label = 'inherited';

  @Get('/inherited/:id')
  inherited(req = request()): { id: string; label: string } {
    return { id: req.pathParam('id'), label: this.label };
  }

  @Get('/removed')
  removed(): { label: string } {
    return { label: 'parent' };
  }

  @Get('/old')
  replaced(): { label: string } {
    return { label: 'parent' };
  }
}

@Controller('/child')
export class InheritedController extends UndecoratedRoutes {
  override removed(): { label: string } {
    return { label: 'unrouted' };
  }

  @Get('/new')
  override replaced(): { label: string } {
    return { label: 'child' };
  }
}

@Controller('/parent')
export class DecoratedParentController extends UndecoratedRoutes {}

export class UndecoratedChildController extends DecoratedParentController {}

@Controller('/sibling')
export class SiblingController extends DecoratedParentController {}
