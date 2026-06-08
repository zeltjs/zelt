export { ElectronAdaptor, type ElectronReady } from './electron.adaptor';
export { ElectronEnvAdaptor } from './electron-env.adaptor';
export { ElectronWindowRegistryService } from './electron-window-registry.service';
export { ElectronWindowRuntimeService } from './electron-window-runtime.service';
export { setupIpcBridge, toIpcResponse, toRequest } from './ipc-bridge';
export { type ElectronAppOptions, type OnElectronApp, onElectron } from './on-electron';
export type {
  WindowDefinition,
  WindowHandle,
  WindowId,
  WindowLoadTarget,
  WindowOpenHandlerResult,
  WindowRuntime,
} from './window.types';
