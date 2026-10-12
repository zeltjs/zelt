import * as v from 'valibot';

const HeadersSchema = v.array(v.tuple([v.string(), v.string()]));
const BodySchema = v.variant('kind', [
  v.object({ kind: v.literal('none') }),
  v.object({ kind: v.literal('base64'), value: v.string() }),
]);

export const BridgeRequestSchema = v.object({
  feature: v.string(),
  method: v.string(),
  path: v.string(),
  headers: HeadersSchema,
  body: BodySchema,
});

export const BridgeResponseSchema = v.object({
  status: v.pipe(v.number(), v.integer(), v.minValue(200), v.maxValue(599)),
  statusText: v.string(),
  headers: HeadersSchema,
  body: BodySchema,
});

export const NativeBridgeSchema = v.object({ api: v.object({ call: v.function() }) });
