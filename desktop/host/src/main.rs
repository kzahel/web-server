use std::io::{self, Read, Write};

fn read_message() -> io::Result<Option<serde_json::Value>> {
    let mut len_buf = [0u8; 4];
    match io::stdin().read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e),
    }
    let len = u32::from_le_bytes(len_buf) as usize;
    if len > 1024 * 1024 {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "message too large"));
    }
    let mut buf = vec![0u8; len];
    io::stdin().read_exact(&mut buf)?;
    let value: serde_json::Value = serde_json::from_slice(&buf)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    Ok(Some(value))
}

fn write_message(value: &serde_json::Value) -> io::Result<()> {
    let json = serde_json::to_vec(value)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    let len = (json.len() as u32).to_le_bytes();
    io::stdout().write_all(&len)?;
    io::stdout().write_all(&json)?;
    io::stdout().flush()?;
    Ok(())
}

fn handle_message(msg: &serde_json::Value) -> serde_json::Value {
    let action = msg.get("action").and_then(|v| v.as_str()).unwrap_or("");

    match action {
        "handshake" => {
            serde_json::json!({
                "action": "handshake",
                "version": env!("CARGO_PKG_VERSION"),
                "name": "ok200-host"
            })
        }
        "ping" => {
            serde_json::json!({
                "action": "pong"
            })
        }
        _ => {
            serde_json::json!({
                "error": format!("unknown action: {action}")
            })
        }
    }
}

fn main() {
    eprintln!("ok200-host: started, pid={}", std::process::id());

    loop {
        match read_message() {
            Ok(Some(msg)) => {
                let response = handle_message(&msg);
                if let Err(e) = write_message(&response) {
                    eprintln!("ok200-host: write error: {e}");
                    break;
                }
            }
            Ok(None) => {
                // stdin closed (extension disconnected)
                break;
            }
            Err(e) => {
                eprintln!("ok200-host: read error: {e}");
                break;
            }
        }
    }

    eprintln!("ok200-host: exiting");
}
