import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useState } from "react";

function App() {
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  return (
    <main>
      <h1>200 OK</h1>
      <p className="version">v{version}</p>
      <p className="subtitle">Web Server</p>
    </main>
  );
}

export default App;
