import io
import os
import time
import uvicorn
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

from model import predict

app = FastAPI(title="Kisan360 Disease Detection Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok", "service": "ml-disease-detection"}

MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10 MB

@app.post("/predict")
async def predict_endpoint(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(400, "File must be an image")

    contents = await file.read()
    if len(contents) == 0:
        raise HTTPException(400, "Empty file")
    if len(contents) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"File too large: {len(contents)} bytes (max {MAX_UPLOAD_BYTES})")

    try:
        image = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Cannot decode image")

    # Limit decoded image dimensions to prevent memory exhaustion
    w, h = image.size
    if w * h > 5000 * 5000:
        raise HTTPException(413, f"Image too large: {w}x{h} pixels (max 5000x5000)")

    t0 = time.time()
    result = predict(image)
    latency = round(time.time() - t0, 3)

    result["latency_seconds"] = latency
    result["input_image"] = file.filename
    return result

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
