type ZeltElectronIpcFeatureNotFoundContext = { readonly ipcFeature: string };

/** No HttpFeature matches the `ipcFeature` key requested for IPC binding. */
export class ZeltElectronIpcFeatureNotFoundError extends Error {
  override readonly name = 'ZeltElectronIpcFeatureNotFoundError';
  readonly context: ZeltElectronIpcFeatureNotFoundContext;

  constructor(context: ZeltElectronIpcFeatureNotFoundContext) {
    super(`No HttpFeature registered with key "${context.ipcFeature}" to bind to the IPC bridge`);
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
