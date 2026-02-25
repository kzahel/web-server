import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";

function App() {
  const [connected, setConnected] = useState(false);
  const [startTime, setStartTime] = useState("");

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "get-status" }, (response) => {
      if (response) {
        setConnected(response.connected);
        setStartTime(response.startTime);
      }
    });
  }, []);

  const handleConnect = () => {
    chrome.runtime.sendMessage({ type: "connect" }, (response) => {
      if (response) {
        setConnected(response.connected);
      }
    });
  };

  return (
    <div style={{ padding: 16, minWidth: 300, fontFamily: "system-ui" }}>
      <h2 style={{ margin: "0 0 12px" }}>200 OK Web Server</h2>
      <div style={{ marginBottom: 8 }}>
        <strong>Status: </strong>
        <span style={{ color: connected ? "#22c55e" : "#ef4444" }}>
          {connected ? "Connected" : "Disconnected"}
        </span>
      </div>
      {startTime && (
        <div style={{ marginBottom: 12, fontSize: 12, color: "#666" }}>
          SW started: {new Date(startTime).toLocaleTimeString()}
        </div>
      )}
      {!connected && (
        <button
          type="button"
          onClick={handleConnect}
          style={{
            padding: "6px 16px",
            cursor: "pointer",
            borderRadius: 4,
            border: "1px solid #ccc",
            background: "#f5f5f5",
          }}
        >
          Connect
        </button>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
