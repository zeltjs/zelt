import type { TinyjsBridgeTargets } from './tinyjs-bridge.types';

export const createBridgeFetchers = (targets: TinyjsBridgeTargets) => {
  const entries = targets instanceof Map ? [...targets] : [['http', targets] as const];
  return new Map(
    entries.map(([name, target]) => [name, (request: Request) => target.fetch(request)] as const),
  );
};
