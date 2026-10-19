import { composeClassDecorators, createClassDecorator } from '../../../index';

/** @throws {E} */
const Inner = (kind: string) => createClassDecorator({ kind });
/** @throws {E} */
const Outer = (kind: string) => Inner(kind);

@Outer('first')
@Outer('second')
export class SameFile {}

/** @throws {E} */
const Composite = () => composeClassDecorators(Outer('composed'), Inner('extra'));
@Composite()
export class Composed {}

const Direct = createClassDecorator({ kind: 'direct' });
@Direct
export class DirectlyDecorated {}

export const firstRepeated = () => {
  @Direct
  class Repeated {}
  return Repeated;
};
export const secondRepeated = () => {
  @Direct
  class Repeated {}
  return Repeated;
};
