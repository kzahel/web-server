export type Listener = (...args: unknown[]) => void;

export class EventEmitter {
  private events: Map<string, Listener[]> = new Map();

  public on(event: string, listener: Listener): this {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)?.push(listener);
    return this;
  }

  public off(event: string, listener: Listener): this {
    if (!this.events.has(event)) return this;
    const listeners = this.events.get(event);
    if (!listeners) return this;
    const index = listeners.indexOf(listener);
    if (index !== -1) {
      listeners.splice(index, 1);
    }
    return this;
  }

  public once(event: string, listener: Listener): this {
    const onceWrapper = (...args: unknown[]) => {
      this.off(event, onceWrapper);
      listener.apply(this, args);
    };
    return this.on(event, onceWrapper);
  }

  public emit(event: string, ...args: unknown[]): boolean {
    if (!this.events.has(event)) return false;
    const listeners = this.events.get(event);
    if (!listeners) return false;
    for (const listener of [...listeners]) {
      listener.apply(this, args);
    }
    return true;
  }

  public removeListener(event: string, listener: Listener): this {
    return this.off(event, listener);
  }

  public removeAllListeners(event?: string): this {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
    return this;
  }

  public listenerCount(event: string): number {
    return this.events.get(event)?.length ?? 0;
  }
}
