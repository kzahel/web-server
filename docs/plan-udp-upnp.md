# Plan: Add UDP + UPnP from JSTorrent

## Goal
Port UDP socket infrastructure and UPnP logic from `~/code/jstorrent` to support automatic port mapping on desktop (Tauri) and Android (QuickJS).

## Architecture Summary
Three adapter layers implementing the same `ISocketFactory` + `IUdpSocket` interfaces:
- **Node.js** — CLI, uses `dgram`
- **Native/QuickJS** — Android, uses `__ok200_*` globals backed by Kotlin
- **Tauri** — Desktop, uses `invoke()`/`listen()` backed by Rust

## Step 1: Engine interfaces — Add UDP to `ISocketFactory`

**File: `packages/engine/src/interfaces/socket.ts`**
- Add `IUdpSocket` interface (from JSTorrent): `send()`, `onMessage()`, `close()`, `joinMulticast()`, `leaveMulticast()`
- Add `UdpSocketOptions` type: `{ bindAddr, bindPort }`
- Add `createUdpSocket(options?: UdpSocketOptions): Promise<IUdpSocket>` to `ISocketFactory`
- Add `NetworkInterface` type: `{ name, address, prefixLength }`
- Export new types from `packages/engine/src/index.ts`

## Step 2: Port UPnP logic from JSTorrent

**Copy and adapt from `~/code/jstorrent/packages/engine/src/upnp/`:**
- `packages/engine/src/upnp/ssdp-client.ts` — SSDP M-SEARCH discovery (nearly identical, just fix imports)
- `packages/engine/src/upnp/gateway-device.ts` — UPnP SOAP control (needs MinimalHttpClient)
- `packages/engine/src/upnp/upnp-manager.ts` — High-level discover/map/renew/cleanup (change description from "JSTorrent" to "200 OK")

**Port dependency:**
- `packages/engine/src/utils/minimal-http-client.ts` — TCP-based HTTP client used by gateway-device for SOAP. Adapt: `toString()` → `decodeToString()`, change User-Agent, add `SocketPurpose` type if needed.

## Step 3: Node.js adapter — `NodeUdpSocket`

**File: `packages/engine/src/adapters/node/node-socket.ts`**
- Add `NodeUdpSocket` class implementing `IUdpSocket` using Node's `dgram` module
- Add `createUdpSocket()` to `NodeSocketFactory`

**File: `packages/engine/src/adapters/node/node-network.ts`** (new)
- `getNetworkInterfaces()` using `os.networkInterfaces()` → `NetworkInterface[]`

## Step 4: Android adapter — QuickJS native bindings + Kotlin

### TypeScript side:
**File: `packages/engine/src/adapters/native/native-udp-socket.ts`** (new)
- Port from JSTorrent's `native-udp-socket.ts`
- Uses `__ok200_udp_*` global functions

**File: `packages/engine/src/adapters/native/bindings.d.ts`**
- Add `__ok200_udp_bind`, `__ok200_udp_send`, `__ok200_udp_close`, `__ok200_udp_join_multicast`, `__ok200_udp_leave_multicast`
- Add `__ok200_udp_on_bound`, `__ok200_udp_on_message`
- Add `__ok200_get_network_interfaces`

**File: `packages/engine/src/adapters/native/native-socket-factory.ts`**
- Add `createUdpSocket()` method

### Kotlin side:
**`android/io-core/src/main/kotlin/app/ok200/io/socket/UdpSocketManager.kt`** (new)
- Port interface + callback from JSTorrent

**`android/io-core/src/main/kotlin/app/ok200/io/socket/UdpSocketService.kt`** (new)
- Port `UdpSocketManagerImpl` + `UdpConnection` from JSTorrent
- Include Android `MulticastLock` handling

**`android/quickjs-engine/src/main/kotlin/app/ok200/quickjs/bindings/UdpBindings.kt`** (new)
- Port from JSTorrent, register `__ok200_udp_*` functions on QuickJS context

**`android/quickjs-engine/src/main/kotlin/app/ok200/quickjs/bindings/NativeBindings.kt`**
- Add UDP service creation, binding registration, event dispatching
- Add UDP dispatchers (JS glue code like existing TCP dispatchers)

## Step 5: Tauri desktop adapter — Rust commands + TS adapter

### TypeScript side:
**`packages/engine/src/adapters/tauri/tauri-udp-socket.ts`** (new)
- `TauriUdpSocket` implementing `IUdpSocket`
- `send()` → `invoke("udp_send", ...)`
- `onMessage()` → `listen("udp-recv", ...)`
- `close()` → `invoke("udp_close", ...)`
- `joinMulticast()` → `invoke("udp_join_multicast", ...)`

**`packages/engine/src/adapters/tauri/tauri-socket-factory.ts`** (new)
- `TauriSocketFactory` implementing `ISocketFactory`
- `createUdpSocket()` → `invoke("udp_bind", ...)`, returns `TauriUdpSocket`
- TCP methods: `invoke("tcp_*")` (stub or implement alongside — needed for MinimalHttpClient/UPnP SOAP)

**`packages/engine/src/adapters/tauri/tauri-network.ts`** (new)
- `getNetworkInterfaces()` → `invoke("get_network_interfaces")`

### Rust side:
**`desktop/tauri-app/src-tauri/Cargo.toml`**
- Add: `tokio` (with net, rt), `socket2` (SO_REUSEADDR), `if-addrs` (network interfaces)

**`desktop/tauri-app/src-tauri/src/udp.rs`** (new)
- UDP socket manager: bind, send, recv loop, multicast join/leave
- Tauri commands: `udp_bind`, `udp_send`, `udp_close`, `udp_join_multicast`, `udp_leave_multicast`
- Recv loop emits `udp-recv` events via `app.emit()`

**`desktop/tauri-app/src-tauri/src/network.rs`** (new)
- `get_network_interfaces` command using `if-addrs` crate

**`desktop/tauri-app/src-tauri/src/lib.rs`**
- Register new commands in `.invoke_handler()`

## Step 6: Tests

- Unit tests for `SSDPClient` response parsing (mock UDP socket)
- Unit tests for `GatewayDevice` XML parsing
- Unit test for `NodeUdpSocket` bind/send/recv
- Rust tests for UDP socket manager

## Not in scope (for now)
- Full TCP adapter for Tauri (only what UPnP needs — MinimalHttpClient can use Node.js TCP on CLI, Tauri TCP commands on desktop)
- Filesystem adapter for Tauri
- Extension lifecycle simplification
