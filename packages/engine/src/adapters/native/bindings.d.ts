/**
 * Type declarations for __ok200_* native bindings.
 *
 * These functions are provided by the Kotlin/JNI host (Android QuickJS).
 * IMPORTANT: QuickJS FFI returns booleans as strings ("true"/"false").
 * Always use === 'true' comparison, never truthiness checks.
 */

// Polyfills
declare function __ok200_console_log(level: string, message: string): void;
declare function __ok200_set_timeout(
  callback: (args: unknown) => void,
  ms: number,
): number;
declare function __ok200_clear_timeout(timerId: number): void;
declare function __ok200_set_interval(
  callback: (args: unknown) => void,
  ms: number,
): number;
declare function __ok200_clear_interval(intervalId: number): void;
declare function __ok200_text_encode(str: string): ArrayBuffer;
declare function __ok200_text_decode(data: ArrayBuffer): string;
declare function __ok200_random_bytes(length: number): ArrayBuffer;

// TCP Server
declare function __ok200_tcp_server_create(): string;
declare function __ok200_tcp_server_listen(
  serverId: string,
  port: string,
  host: string,
): void;
declare function __ok200_tcp_server_close(serverId: string): void;
declare function __ok200_tcp_server_address(serverId: string): string | null;

// TCP Socket (accepted connections)
declare function __ok200_tcp_send(socketId: string, data: ArrayBuffer): string;
declare function __ok200_tcp_close(socketId: string): void;

// TCP Event Callbacks
declare function __ok200_tcp_on_data(
  callback: (socketId: number, data: ArrayBuffer) => void,
): void;
declare function __ok200_tcp_on_close(
  callback: (socketId: number, hadError: boolean) => void,
): void;
declare function __ok200_tcp_on_error(
  callback: (socketId: number, message: string) => void,
): void;
declare function __ok200_tcp_on_listening(
  callback: (serverId: number, success: boolean, port: number) => void,
): void;
declare function __ok200_tcp_on_accept(
  callback: (
    serverId: number,
    socketId: number,
    remoteAddr: string,
    remotePort: number,
  ) => void,
): void;

// Filesystem (read-only)
declare function __ok200_file_stat(path: string): string | null;
declare function __ok200_file_exists(path: string): string;
declare function __ok200_file_read(
  path: string,
  offset: string,
  length: string,
): ArrayBuffer | null;
declare function __ok200_file_readdir(path: string): string | null;
declare function __ok200_file_realpath(path: string): string | null;
declare function __ok200_file_list_tree(path: string): string;

// Engine Callbacks
declare function __ok200_report_state(stateJson: string): void;
declare function __ok200_report_error(message: string): void;
