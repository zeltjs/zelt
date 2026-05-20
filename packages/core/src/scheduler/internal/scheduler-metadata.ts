import { getClassMetadata } from '@zeltjs/decorator-metadata';
import { match, P } from 'ts-pattern';

type ScheduleMetadata = {
  readonly methodName: string | symbol;
  readonly cronExpression: string;
  readonly timezone?: string;
};

const scheduledPattern = { decorator: 'Scheduled' as const };

const schedulePattern = {
  decorator: 'Schedule' as const,
  cronExpression: P.string,
  timezone: P.optional(P.string),
};

/** @throws {ZeltLifecycleStateError} */
export const getScheduledMetadata = (cls: object): true | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  for (const p of meta.props) {
    const found = match(p)
      .with(scheduledPattern, () => true as const)
      .otherwise(() => false);
    if (found) return true;
  }
  return undefined;
};

/** @throws {ZeltLifecycleStateError} */
export const getScheduleMetadata = (cls: object): readonly ScheduleMetadata[] => {
  const meta = getClassMetadata(cls);
  if (!meta) return [];
  const result: ScheduleMetadata[] = [];
  for (const m of meta.methods) {
    for (const p of m.props) {
      const entry = match(p)
        .with(schedulePattern, (s): ScheduleMetadata => {
          const base: ScheduleMetadata = {
            methodName: m.name,
            cronExpression: s.cronExpression,
          };
          return s.timezone !== undefined ? { ...base, timezone: s.timezone } : base;
        })
        .otherwise(() => undefined);
      if (entry) result.push(entry);
    }
  }
  return result;
};
