import os
import time
import threading
import webbrowser
import uvicorn

def _open_landing_page(url: str):
    time.sleep(1.2)
    webbrowser.open(url)

if __name__ == "__main__":
    # Default to 127.0.0.1 and reload=True locally; Docker overrides via environment variables
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8000))
    reload = os.environ.get("RELOAD", "true").lower() == "true"
    display_host = "localhost" if host in ("0.0.0.0", "127.0.0.1") else host
    landing_url = f"http://{display_host}:{port}/"
    print(f"Starting flood simulation server at {landing_url}")
    print(f"Opening landing page first: {landing_url}")

    if os.environ.get("NO_BROWSER", "").lower() not in ("1", "true"):
        threading.Thread(target=_open_landing_page, args=(landing_url,), daemon=True).start()

    uvicorn.run("src.server:app", host=host, port=port, reload=reload)
