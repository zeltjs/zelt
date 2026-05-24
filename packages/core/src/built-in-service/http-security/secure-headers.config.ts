import { Config } from '../config';

type OverridableHeader = boolean | string;

@Config
export class SecureHeadersConfig {
  static readonly Token = SecureHeadersConfig;

  get crossOriginEmbedderPolicy(): OverridableHeader {
    return false;
  }

  get crossOriginResourcePolicy(): OverridableHeader {
    return true;
  }

  get crossOriginOpenerPolicy(): OverridableHeader {
    return true;
  }

  get originAgentCluster(): OverridableHeader {
    return true;
  }

  get referrerPolicy(): OverridableHeader {
    return true;
  }

  get strictTransportSecurity(): OverridableHeader {
    return true;
  }

  get xContentTypeOptions(): OverridableHeader {
    return true;
  }

  get xDnsPrefetchControl(): OverridableHeader {
    return true;
  }

  get xDownloadOptions(): OverridableHeader {
    return true;
  }

  get xFrameOptions(): OverridableHeader {
    return true;
  }

  get xPermittedCrossDomainPolicies(): OverridableHeader {
    return true;
  }

  get xXssProtection(): OverridableHeader {
    return true;
  }

  get removePoweredBy(): boolean {
    return true;
  }
}
