import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { startServer, stopServer } from "./server";

function App() {
  const [version, setVersion] = useState("");
  const [root, setRoot] = useState("");
  const [port, setPort] = useState(8080);
  const [running, setRunning] = useState(false);
  const [actualPort, setActualPort] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const handleStart = useCallback(async () => {
    if (!root) {
      setError("Select a directory to serve");
      return;
    }
    setError(null);
    try {
      const p = await startServer({ root, port });
      setActualPort(p);
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [root, port]);

  const handleStop = useCallback(async () => {
    try {
      await stopServer();
      setRunning(false);
      setActualPort(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const serverUrl = actualPort ? `http://127.0.0.1:${actualPort}` : null;

  return (
    <main>
      <h1>200 OK</h1>
      <p className="version">v{version}</p>

      <div className="controls">
        <label>
          Directory
          <input
            data-testid="dir-input"
            type="text"
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="/path/to/serve"
            disabled={running}
          />
        </label>

        <label>
          Port
          <input
            data-testid="port-input"
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            min={0}
            max={65535}
            disabled={running}
          />
        </label>

        {running ? (
          <button data-testid="stop-btn" type="button" onClick={handleStop}>
            Stop Server
          </button>
        ) : (
          <button data-testid="start-btn" type="button" onClick={handleStart}>
            Start Server
          </button>
        )}
      </div>

      {error && (
        <p data-testid="error-msg" className="error">
          {error}
        </p>
      )}

      {serverUrl && (
        <p className="status">
          Serving at{" "}
          <a
            data-testid="server-url"
            href={serverUrl}
            onClick={(e) => {
              e.preventDefault();
              invoke("plugin:opener|open_url", { url: serverUrl });
            }}
          >
            {serverUrl}
          </a>
        </p>
      )}
    </main>
  );
}

export default App;
