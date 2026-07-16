import type {
  CustomElementOverlayController,
  CustomElementOverlayStateUpdater,
} from "../types";

type OverlayRuntimeEntry = {
  open: boolean;
  generation: number;
};

const getKey = (elementId: string, overlayId: string) =>
  `${elementId}\u0000${overlayId}`;

export class CustomElementOverlayRuntime
  implements CustomElementOverlayController
{
  private entries = new Map<string, OverlayRuntimeEntry>();
  private states = new Map<string, unknown>();
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

  public open = (elementId: string, overlayId: string) => {
    if (this.destroyed) {
      return;
    }
    const key = getKey(elementId, overlayId);
    const previous = this.entries.get(key);
    this.entries.set(key, {
      open: true,
      generation: (previous?.generation ?? 0) + 1,
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
    this.entries.set(key, {
      open: false,
      generation: previous.generation + 1,
    });
    this.emit();
  };

  public toggle = (elementId: string, overlayId: string) => {
    if (this.destroyed) {
      return;
    }
    if (this.isOpen(elementId, overlayId)) {
      this.close(elementId, overlayId);
    } else {
      this.open(elementId, overlayId);
    }
  };

  public closeAfter = async (
    elementId: string,
    overlayId: string,
    promise: Promise<unknown>,
    options?: Readonly<{ closeOnError?: boolean }>,
  ): Promise<"closed" | "stale" | "failed"> => {
    const key = getKey(elementId, overlayId);
    const generation = this.entries.get(key)?.generation ?? 0;
    try {
      await promise;
    } catch {
      if (!options?.closeOnError) {
        return "failed";
      }
    }
    if (this.destroyed || this.entries.get(key)?.generation !== generation) {
      return "stale";
    }
    this.close(elementId, overlayId);
    return "closed";
  };

  public setState = <TState = unknown>(
    elementId: string,
    stateScope: string,
    updater: CustomElementOverlayStateUpdater<TState>,
  ) => {
    if (this.destroyed) {
      return;
    }
    const key = getKey(elementId, stateScope);
    const previous = this.states.get(key) as TState | undefined;
    const state =
      typeof updater === "function"
        ? (updater as (previous: TState | undefined) => TState)(previous)
        : updater;
    if (previous === state) {
      return;
    }
    this.states.set(key, state);
    this.emit();
  };

  public patchState = <TState extends Readonly<Record<string, unknown>>>(
    elementId: string,
    stateScope: string,
    patch:
      | Partial<TState>
      | ((previous: TState | undefined) => Partial<TState>),
  ) => {
    const previous = this.getState<TState>(elementId, stateScope);
    if (
      previous !== undefined &&
      (typeof previous !== "object" ||
        previous === null ||
        Array.isArray(previous))
    ) {
      throw new Error(
        "Custom element overlay patchState requires object state",
      );
    }
    const nextPatch = typeof patch === "function" ? patch(previous) : patch;
    if (
      typeof nextPatch !== "object" ||
      nextPatch === null ||
      Array.isArray(nextPatch)
    ) {
      throw new Error(
        "Custom element overlay patchState requires an object patch",
      );
    }
    this.setState<TState>(elementId, stateScope, {
      ...(previous ?? ({} as TState)),
      ...nextPatch,
    });
  };

  public getState = <TState = unknown>(elementId: string, stateScope: string) =>
    this.states.get(getKey(elementId, stateScope)) as TState | undefined;

  public isOpen = (elementId: string, overlayId: string) =>
    this.entries.get(getKey(elementId, overlayId))?.open === true;

  public closeAll = (elementId?: string) => {
    if (this.destroyed) {
      return;
    }
    if (elementId === undefined) {
      if (!this.entries.size && !this.states.size) {
        return;
      }
      this.entries.clear();
      this.states.clear();
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
    for (const key of this.states.keys()) {
      if (key.startsWith(prefix)) {
        this.states.delete(key);
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
    for (const key of this.states.keys()) {
      const separator = key.indexOf("\u0000");
      if (!elementIds.has(key.slice(0, separator))) {
        this.states.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  };

  public pruneOverlays = (
    isValid: (elementId: string, overlayId: string) => boolean,
    isValidStateScope: (elementId: string, stateScope: string) => boolean,
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
    for (const key of this.states.keys()) {
      const separator = key.indexOf("\u0000");
      if (
        !isValidStateScope(key.slice(0, separator), key.slice(separator + 1))
      ) {
        this.states.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this.emit();
    }
  };

  public reset = () => {
    this.entries.clear();
    this.states.clear();
    this.listeners.clear();
    this.revision = 0;
    this.destroyed = false;
  };

  public destroy = () => {
    this.destroyed = true;
    this.entries.clear();
    this.states.clear();
    this.listeners.clear();
  };
}
