from fastapi import FastAPI, HTTPException

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "This is the pomodoro backend!"}

@app.get("/health")
def read_health():
    return {"status": "healthy"}
