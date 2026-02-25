const SW_START_TIME = new Date().toISOString();
console.log(`[SW] Service Worker loaded at ${SW_START_TIME}`);

self.addEventListener("install", () => {
  console.log("[SW] Install event");
});

self.addEventListener("activate", () => {
  console.log("[SW] Activate event");
});

import { getNativeConnection } from "./lib/native-connection";

// ============================================================================
// Native Host Connection
// ============================================================================

const nativeConnection = getNativeConnection();

async function connectToNativeHost() {
  try {
    await nativeConnection.connect();
    console.log("[SW] Connected to native host");

    nativeConnection.onMessage((msg) => {
      console.log("[SW] Native message:", msg);
    });

    nativeConnection.onDisconnect(() => {
      console.log("[SW] Native host disconnected");
    });
  } catch (e) {
    console.error("[SW] Failed to connect to native host:", e);
  }
}

// ============================================================================
// Message handling from popup UI
// ============================================================================

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("[SW] Received message:", message);

  if (message.type === "get-status") {
    sendResponse({
      connected: nativeConnection.isConnected(),
      startTime: SW_START_TIME,
    });
    return false;
  }

  if (message.type === "connect") {
    connectToNativeHost().then(() => {
      sendResponse({ connected: nativeConnection.isConnected() });
    });
    return true; // async response
  }

  return false;
});

// Auto-connect on startup
connectToNativeHost();
