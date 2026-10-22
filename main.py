import os
import uvicorn

if __name__ == "__main__":
    # Default to 127.0.0.1 and reload=True locally; Docker overrides via environment variables
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8000))
    reload = os.environ.get("RELOAD", "true").lower() == "true"
    display_host = "localhost" if host in ("0.0.0.0", "127.0.0.1") else host
    print(f"Starting flood simulation server at http://{display_host}:{port}")
    uvicorn.run("src.server:app", host=host, port=port, reload=reload)
