import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });

@Service
export default class DefaultDep {}
