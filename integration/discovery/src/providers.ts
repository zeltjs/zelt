import { CleanupWebhook } from './my-webhook/cleanup.webhook';
import { FlushWebhook } from './my-webhook/flush.webhook';

// The set of providers under inspection. Mirrors what MyWebhookModule
// registers in the NestJS reference (CleanupWebhook + FlushWebhook).
export const providers = [CleanupWebhook, FlushWebhook] as const;
