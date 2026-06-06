import { Config } from '../../../../built-in-service';

type OverridableHeader = boolean | string;

@Config
export class SecureHeadersConfig {
  readonly crossOriginEmbedderPolicy: OverridableHeader = false;

  readonly crossOriginResourcePolicy: OverridableHeader = true;

  readonly crossOriginOpenerPolicy: OverridableHeader = true;

  readonly originAgentCluster: OverridableHeader = true;

  readonly referrerPolicy: OverridableHeader = true;

  readonly strictTransportSecurity: OverridableHeader = true;

  readonly xContentTypeOptions: OverridableHeader = true;

  readonly xDnsPrefetchControl: OverridableHeader = true;

  readonly xDownloadOptions: OverridableHeader = true;

  readonly xFrameOptions: OverridableHeader = true;

  readonly xPermittedCrossDomainPolicies: OverridableHeader = true;

  readonly xXssProtection: OverridableHeader = true;

  readonly removePoweredBy: boolean = true;
}
