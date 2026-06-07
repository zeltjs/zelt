import { Injectable, inject } from '@zeltjs/core';
import type { WindowDefinition, WindowHandle, WindowId } from './window.types';
import { ElectronWindowRuntime } from './window-runtime';

@Injectable()
export class WindowRegistry {
  private readonly windows = new Map<WindowId, WindowHandle>();

  constructor(private readonly runtime: ElectronWindowRuntime = inject(ElectronWindowRuntime)) {}

  open(definition: WindowDefinition): WindowHandle {
    const existing = this.windows.get(definition.id);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    const handle = this.runtime.open(definition);
    this.windows.set(definition.id, handle);

    handle.on('closed', () => {
      this.windows.delete(definition.id);
    });

    return handle;
  }

  close(id: WindowId): void {
    const handle = this.windows.get(id);
    if (handle && !handle.isDestroyed()) {
      handle.close();
    }
  }

  closeAll(): void {
    for (const handle of this.windows.values()) {
      if (!handle.isDestroyed()) {
        handle.close();
      }
    }
  }

  count(): number {
    return this.windows.size;
  }
}
