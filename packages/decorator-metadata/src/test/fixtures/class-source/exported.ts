import { createClassDecorator } from '../../../index';

const Service = createClassDecorator({ type: 'service' });

@Service
export class ExportedService {}

@Service
class Renamed {}

export { Renamed as AliasedService };

@Service
class HiddenService {}

// export されないクラスは ClassSource に変換できないケースの fixture。
// 未使用扱いにならないよう参照だけ残す
export const hiddenRef = (): unknown => HiddenService;
