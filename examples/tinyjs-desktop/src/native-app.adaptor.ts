import { TinyjsAppAdaptor } from '@zeltjs/adapter-tinyjs';
import { Config } from '@zeltjs/core';

// The example declares its native requirements; applications can use their installed tinyjs type.
type DesktopNativeApp = {
  done: Promise<unknown>;
  readonly setTitle: (title: string) => unknown;
};

@Config
export class DesktopAppAdaptor extends TinyjsAppAdaptor<DesktopNativeApp> {}
