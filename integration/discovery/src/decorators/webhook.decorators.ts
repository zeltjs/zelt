import {
  createClassDecorator,
  createMethodDecorator,
  getClassMetadata,
} from '@zeltjs/decorator-metadata';

// Discriminator strings used at runtime to recognize each decorator on
// stored metadata props (mirrors NestJS DiscoveryService metadata key).
const WEBHOOK_KEY = 'integration/discovery/Webhook';
const WEBHOOK_HANDLER_KEY = 'integration/discovery/WebhookHandler';

type WebhookProps = { readonly decorator: typeof WEBHOOK_KEY; readonly name: string };
type WebhookHandlerProps = {
  readonly decorator: typeof WEBHOOK_HANDLER_KEY;
  readonly event: string;
};

export const Webhook = (options: { name: string }) =>
  createClassDecorator<WebhookProps>({ decorator: WEBHOOK_KEY, name: options.name });

export const WebhookHandler = (options: { event: string }) =>
  createMethodDecorator<WebhookHandlerProps>({
    decorator: WEBHOOK_HANDLER_KEY,
    event: options.event,
  });

const isWebhookProps = (p: object): p is WebhookProps =>
  (p as { decorator?: unknown }).decorator === WEBHOOK_KEY;

const isWebhookHandlerProps = (p: object): p is WebhookHandlerProps =>
  (p as { decorator?: unknown }).decorator === WEBHOOK_HANDLER_KEY;

export const getWebhookMetadata = (cls: object): { name: string } | undefined => {
  const meta = getClassMetadata(cls);
  if (!meta) return undefined;
  for (const p of meta.props) {
    if (isWebhookProps(p)) return { name: p.name };
  }
  return undefined;
};

export type WebhookHandlerInfo = { readonly methodName: string; readonly event: string };

export const getWebhookHandlers = (cls: object): readonly WebhookHandlerInfo[] => {
  const meta = getClassMetadata(cls);
  if (!meta) return [];
  const handlers: WebhookHandlerInfo[] = [];
  for (const m of meta.methods) {
    if (typeof m.name !== 'string') continue;
    for (const p of m.props) {
      if (isWebhookHandlerProps(p)) {
        handlers.push({ methodName: m.name, event: p.event });
      }
    }
  }
  return handlers;
};
