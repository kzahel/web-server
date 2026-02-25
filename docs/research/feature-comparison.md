# Feature Comparison: Web Server for Chrome vs Simple Web Server

## Origin Story

**Web Server for Chrome** (200ok) had ~200k+ users as a Chrome App. Chrome Apps
were deprecated. The fork **Simple Web Server** by @terreng and @ethanaobrien
picked it up and built it into an Electron desktop app, steadily adding features
over the years. They have a polished docs site at simplewebserver.org, 18
language translations, and distribute via Mac App Store, Windows installers,
and Linux packages.

They explicitly do NOT support ChromeOS (they link back to Web Server for Chrome
for that). This is a gap we fill.

---

## Feature Matrix

| Feature | WS Chrome | Simple WS | Notes |
|---|:---:|:---:|---|
| **Core** | | | |
| Static file serving | Y | Y | |
| Custom port | Y | Y | WS Chrome default 8887, SWS default 8080 |
| Directory listing | Y | Y | SWS has interactive + static + JSON modes |
| Auto-serve index.html | Y | Y | Both check index.html/htm/xhtml |
| MIME type detection | Y | Y | |
| **Network** | | | |
| LAN access (0.0.0.0) | Y | Y | |
| IPv6 | Y | Y | |
| CORS headers | Y | Y | |
| UPnP port mapping | Y | - | WS Chrome had "also on internet" via UPnP |
| **SPA** | | | |
| Mod-rewrite / SPA mode | Y | Y | |
| Custom rewrite target | Y | Y | |
| Rewrite regex | Y | Y | SWS simplified this |
| **HTTPS** | | | |
| HTTPS/TLS | Y | Y | |
| Self-signed cert generation | Y | Y | SWS uses node-forge, WS Chrome had custom |
| Custom cert/key | Y | Y | |
| **Auth & Security** | | | |
| HTTP Basic Auth | Y | Y | |
| IP throttling | - | Y | Default 10 conn/IP |
| **File Operations** | | | |
| File upload (PUT) | Y | Y | |
| File replacement | - | Y | Separate toggle |
| File deletion (DELETE) | - | Y | |
| Hidden/dot files | - | Y | Serve + directory listing toggles |
| **Compression** | | | |
| Precompressed (.gz/.br) | - | Y | Transparent serving |
| On-the-fly compression | - | Y | Marked experimental/slow |
| **Advanced** | | | |
| Cache-Control header | - | Y | Custom header string |
| .swshtaccess files | - | Y | Per-directory rules |
| Plugin system | - | Y | onStart + onRequest hooks |
| Custom error pages | - | Y | 401, 403, 404 |
| Remove .html extensions | - | Y | Clean URLs |
| Multiple servers | - | Y | Each with own config |
| **Protocol** | | | |
| HTTP Range requests | Y | Y | For media streaming |
| Keep-alive | Y | Y | |
| Chunked transfer | Y | Y | |
| WebSocket support | Y | - | WS Chrome had full RFC 6455 |
| **Platform** | | | |
| Chrome App | Y | - | Deprecated |
| Electron | - | Y | |
| Mac App Store | - | Y | |
| Windows/Linux/macOS | - | Y | |
| ChromeOS | Y | - | They punt to WS Chrome |
| Android | - | - | Neither |
| **UX** | | | |
| Run in background | Y | Y | |
| System tray | - | Y | macOS + Windows |
| Start on login | Y | Y | |
| Prevent sleep | Y | - | Chrome power API |
| i18n | - | Y | 18 languages |
| Verbose logging | Y | Y | SWS logs to file |
| Drag-and-drop reorder | - | Y | Multiple server management |

---

## What Simple Web Server Added Over the Years

Features they built beyond the original:

1. **Multiple simultaneous servers** - big UX win, manage a fleet of dev servers
2. **Plugin system** - extensibility via manifest + hooks
3. **.swshtaccess** - per-directory config (redirects, auth, versioning)
4. **Custom error pages** - 401/403/404 with path variable substitution
5. **File management** - upload, replace, delete as separate toggles
6. **Precompression** - smart .gz/.br serving
7. **Clean URLs** - strip .html extensions
8. **Cache-Control** - configurable caching header
9. **IP throttling** - basic DDoS protection
10. **18 languages** - community translations
11. **System tray** - background operation UX
12. **Hidden files** - dot-file serving + listing toggles

## What They Dropped

1. **WebSocket support** - WS Chrome had full RFC 6455 implementation
2. **UPnP port mapping** - "also on internet" feature
3. **Prevent sleep** - Chrome power API specific
4. **ChromeOS support** - explicitly unsupported

## What Neither Has

1. **Android/mobile app**
2. **Markdown rendering**
3. **Built-in terminal/log viewer in UI**
4. **QR code for mobile access** (common in similar tools)
5. **Drag-and-drop file upload in browser**
6. **API/programmatic control**
7. **Custom headers (arbitrary)**
8. **Reverse proxy**
9. **Virtual hosts**
10. **Hot reload / live reload / file watching** (SWS has chokidar dep but unclear if exposed)
