import { EventEmitter } from '../utils/event-emitter.js'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface Logger {
  debug(message: string, ...args: unknown[]): void
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

export interface ILoggingEngine {
  clientId: string
  scopedLoggerFor(component: ILoggableComponent): Logger
}

export interface ILoggableComponent {
  getLogName(): string
  getStaticLogName(): string
  engineInstance: ILoggingEngine
}

export abstract class EngineComponent extends EventEmitter implements ILoggableComponent {
  protected engine: ILoggingEngine

  public get engineInstance(): ILoggingEngine {
    return this.engine
  }

  static logName: string = 'component'

  protected instanceLogName?: string
  private _logger?: Logger

  constructor(engine: ILoggingEngine) {
    super()
    this.engine = engine
  }

  protected get logger(): Logger {
    if (!this._logger) {
      this._logger = this.engine.scopedLoggerFor(this)
    }
    return this._logger
  }

  getLogName(): string {
    return this.instanceLogName ?? (this.constructor as unknown as { logName: string }).logName
  }

  getStaticLogName(): string {
    return (this.constructor as unknown as { logName: string }).logName
  }
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

export interface LogEntry {
  id?: number
  timestamp: number
  level: LogLevel
  message: string
  args: unknown[]
}

type LogListener = (entry: LogEntry) => void

export class LogStore {
  private logs: LogEntry[] = []
  private maxLogs: number = 1000
  private nextId: number = 0
  private listeners: Set<LogListener> = new Set()

  add(level: LogLevel, message: string, args: unknown[]): void {
    const entry: LogEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      level,
      message,
      args,
    }
    this.logs.push(entry)

    if (this.logs.length > this.maxLogs * 1.5) {
      this.logs = this.logs.slice(-this.maxLogs)
    }

    for (const listener of this.listeners) {
      try {
        listener(entry)
      } catch (e) {
        console.error('Log listener error:', e)
      }
    }
  }

  getEntries(): LogEntry[] {
    return this.logs
  }

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  clear(): void {
    this.logs = []
  }

  get size(): number {
    return this.logs.length
  }
}

export function basicLogger(): Logger {
  return console as unknown as Logger
}

export function prefixedLogger(prefix: string, base: Logger = basicLogger()): Logger {
  return {
    debug: (msg, ...args) => base.debug(`[${prefix}]`, msg, ...args),
    info: (msg, ...args) => base.info(`[${prefix}]`, msg, ...args),
    warn: (msg, ...args) => base.warn(`[${prefix}]`, msg, ...args),
    error: (msg, ...args) => base.error(`[${prefix}]`, msg, ...args),
  }
}

export function filteredLogger(level: LogLevel, base: Logger = basicLogger()): Logger {
  const minPriority = LEVEL_PRIORITY[level]
  const noop = () => {}
  return {
    debug: minPriority <= 0 ? base.debug.bind(base) : noop,
    info: minPriority <= 1 ? base.info.bind(base) : noop,
    warn: minPriority <= 2 ? base.warn.bind(base) : noop,
    error: base.error.bind(base),
  }
}
