export { ElectronAdaptor, type ElectronReady } from './electron.adaptor';
export { ElectronEnvAdaptor } from './electron-env.adaptor';
export {
  type ElectronIpcCapabilities,
  ElectronIpcFeature,
  electronIpc,
} from './electron-ipc.feature';
export type {
  ElectronIpcChannel,
  ElectronIpcHandle,
  ElectronIpcListenOptions,
} from './electron-ipc.types';
export { ElectronWindowRegistryService } from './electron-window-registry.service';
export { ElectronWindowRuntimeService } from './electron-window-runtime.service';
export { ipcEvent, setupIpcBridge, toIpcResponse, toRequest } from './ipc-bridge';
export {
  type ElectronAppOptions,
  type OnElectronApp,
  onElectron,
} from './on-electron';
export type {
  WindowDefinition,
  WindowHandle,
  WindowId,
  WindowLoadTarget,
  WindowOpenHandlerResult,
  WindowRuntime,
} from './window.types';
