type ScheduleMetadata = {
  readonly methodName: string | symbol;
  readonly cronExpression: string;
  readonly timezone?: string;
};

const scheduledStore = new WeakMap<object, true>();
const scheduleStore = new WeakMap<object, ScheduleMetadata[]>();
const pendingScheduleStore = new WeakMap<object, ScheduleMetadata[]>();

export const setScheduledMetadata = (cls: object): void => {
  scheduledStore.set(cls, true);
};

export const getScheduledMetadata = (cls: object): true | undefined => scheduledStore.get(cls);

export const appendPendingScheduleMetadata = (pendingKey: object, meta: ScheduleMetadata): void => {
  const existing = pendingScheduleStore.get(pendingKey) ?? [];
  pendingScheduleStore.set(pendingKey, [...existing, meta]);
};

export const resolveScheduleMetadata = (pendingKey: object, cls: object): void => {
  const pending = pendingScheduleStore.get(pendingKey);
  if (pending) {
    const existing = scheduleStore.get(cls) ?? [];
    scheduleStore.set(cls, [...existing, ...pending]);
    pendingScheduleStore.delete(pendingKey);
  }
};

export const getScheduleMetadata = (cls: object): readonly ScheduleMetadata[] =>
  scheduleStore.get(cls) ?? [];

// Deprecated: kept for backward compatibility during migration
export const appendScheduleMetadata = appendPendingScheduleMetadata;
