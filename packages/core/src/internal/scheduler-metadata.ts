type ScheduleMetadata = {
  readonly methodName: string | symbol;
  readonly cronExpression: string;
  readonly timezone?: string;
};

const scheduledStore = new WeakMap<object, true>();
const scheduleStore = new WeakMap<object, ScheduleMetadata[]>();

export const setScheduledMetadata = (cls: object): void => {
  scheduledStore.set(cls, true);
};

export const getScheduledMetadata = (cls: object): true | undefined => scheduledStore.get(cls);

export const appendScheduleMetadata = (cls: object, meta: ScheduleMetadata): void => {
  const existing = scheduleStore.get(cls) ?? [];
  scheduleStore.set(cls, [...existing, meta]);
};

export const getScheduleMetadata = (cls: object): readonly ScheduleMetadata[] =>
  scheduleStore.get(cls) ?? [];
