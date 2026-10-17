declare global {
  namespace Cloudflare {
    interface Env {
      URLS: KVNamespace;
    }
  }
}

export {};
