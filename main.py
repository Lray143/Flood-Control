import os
import uvicorn

if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8000))
    reload = os.environ.get("RELOAD", "false").lower() == "true"
    print(f"Starting flood simulation server on http://{host}:{port}")
    uvicorn.run("src.server:app", host=host, port=port, reload=reload)
