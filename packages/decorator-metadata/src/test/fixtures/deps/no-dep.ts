import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });

@Service
export class NoDepService {
  getValue(): string {
    return 'value';
  }
}
