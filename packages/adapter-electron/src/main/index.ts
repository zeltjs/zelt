export { ElectronApp, type ElectronReady } from './electron-app';
export { ElectronEnvAdaptor } from './electron-env.adaptor';
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
export { WindowRegistry } from './window-registry';
export { createWindowHandle, ElectronWindowRuntime } from './window-runtime';
