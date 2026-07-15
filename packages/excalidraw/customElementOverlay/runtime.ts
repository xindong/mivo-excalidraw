import type {
  CustomElementOverlayController,
  CustomElementOverlayStateUpdater,
} from "../types";

type OverlayRuntimeEntry = {
  open: boolean;
  state: unknown;
};

const getKey = (elementId: string, overlayId: string) =>
  `${elementId}\u0000${overlayId}`;

export class CustomElementOverlayRuntime
  implements CustomElementOverlayController
{
  private entries = new Map<string, OverlayRuntimeEntry>();
  private listeners = new Set<() => void>();
  private revision = 0;
  private destroyed = false;

  public subscribe = (listener: () => void) => {
    if (this.destroyed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public getSnapshot = () => this.revision;

  private emit = () => {
    if (this.destroyed) {
      return;
    }
    this.revision++;
    this.listeners.forEach((listener) => listener());
  };

  public open = <TState = unknown>(
    elementId: string,
    overlayId: string,
    state?: TState,
  ) => {
    if (this.destroyed) {
      return;
    }
    const key = getKey(elementId, overlayId);
    const previous = this.entries.get(key);
    if (previous?.open && state === undefined) {
      return;
    }
    this.entries.set(key, {
      open: true,
      state: state === undefined ? previous?.state : state,
    });
    this.emit();
  };

  public close = (elementId: string, overlayId: string) => {
    if (this.destroyed) {
      return;
    }
    const key = getKey(elementId, overlayId);
    const previous = this.entries.get(key);
    if (!previous?.open) {
      return;
    }
    this.entries.set(key, { ...previous, open: false });
    this.emit();
  };

  public toggle = <TState = unknown>(
    elementId: string,
    overlayId: string,
    state?: TState,
  ) => {
    if (this.destroyed) {
      return;
    }
    if (this.isOpen(elementId, overlayId)) {
      this.close(elementId, overlayId);
    } else {
      this.open(elementId, overlayId, state);
    }
  };

  public setState = <TState = unknown>(
    elementId: string,
    overlayId: string,
    updater: CustomElementOverlayStateUpdater<TState>,
  ) => {
    if (this.destroyed) {
      return;
    }
    const key = getKey(elementId, overlayId);
    const previous = this.entries.get(key);
    const state =
      typeof updater === "function"
        ? (updater as (previous: TState | undefined) => TState)(
            previous?.state as TState | undefined,
          )
        : updater;
    if (previous?.state === state) {
      return;
    }
    this.entries.set(key, { open: previous?.open ?? false, state });
    this.emit();
  };

  public getState = <TState = unknown>(elementId: string, overlayId: string) =>
    this.entries.get(getKey(elementId, overlayId))?.state as TState | undefined;

  public isOpen = (elementId: string, overlayId: string) =>
    this.entries.get(getKey(elementId, overlayId))?.open === true;

  public closeAll = (elementId?: string) => {
    if (this.destroyed) {
      return;
    }
    if (elementId === undefined) {
      if (!this.entries.size) {
        return;
      }
      this.entries.clear();
      this.emit();
      return;
    }

    const prefix = `${elementId}\u0000`;
    let changed = false;
    for (const key of this.entries.keys()) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  };

  public prune = (elementIds: ReadonlySet<string>) => {
    if (this.destroyed) {
      return;
    }
    let changed = false;
    for (const key of this.entries.keys()) {
      const separator = key.indexOf("\u0000");
      if (!elementIds.has(key.slice(0, separator))) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  };

  public pruneOverlays = (
    isValid: (elementId: string, overlayId: string) => boolean,
  ) => {
    if (this.destroyed) {
      return;
    }
    let changed = false;
    for (const key of this.entries.keys()) {
      const separator = key.indexOf("\u0000");
      if (!isValid(key.slice(0, separator), key.slice(separator + 1))) {
        this.entries.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  };

  public reset = () => {
    this.entries.clear();
    this.listeners.clear();
    this.revision = 0;
    this.destroyed = false;
  };

  public destroy = () => {
    this.destroyed = true;
    this.entries.clear();
    this.listeners.clear();
  };
}
