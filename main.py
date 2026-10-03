import uvicorn

if __name__ == "__main__":
    print("Starting local flood simulation server at http://localhost:8000")
    uvicorn.run("src.server:app", host="127.0.0.1", port=8000, reload=True)
