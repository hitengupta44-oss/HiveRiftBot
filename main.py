"""
FastAPI Backend for the RAG Chatbot.
Serves both the API and the frontend static files.
"""

import os
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

# ── Path setup (works both locally and in Docker) ──────────────────────
# When run as `python main.py` from backend/, or as `backend.main` from root
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BACKEND_DIR)

# Ensure backend dir is on sys.path for imports
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from rag_engine import RAGEngine
from config import HOST, PORT

# ── RAG Engine Instance ────────────────────────────────────────────────
rag = RAGEngine()


# ── Lifespan (startup / shutdown) ──────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[Server] Initializing RAG engine...")
    rag.initialize()
    print("[Server] RAG engine ready. Server is live!")
    yield
    print("[Server] Shutting down.")


# ── App ─────────────────────────────────────────────────────────────────
app = FastAPI(
    title="HiveRift RAG Chatbot API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response Models ──────────────────────────────────────────
class ChatRequest(BaseModel):
    message: str


class ChunkInfo(BaseModel):
    text: str
    source: str
    score: float


class ChatResponse(BaseModel):
    reply: str
    source: str  # "kb" | "generic" | "fallback" | "system"
    chunks_used: list[ChunkInfo] = []


# ── API Endpoints ──────────────────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "rag_ready": rag.is_ready}


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    """Process a chat message through the RAG engine."""
    if not req.message.strip():
        return ChatResponse(
            reply="Please type a message to get started!",
            source="system",
            chunks_used=[],
        )

    result = rag.query(req.message.strip())
    return ChatResponse(**result)


# ── Serve Frontend ─────────────────────────────────────────────────────
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")

if os.path.isdir(FRONTEND_DIR):
    @app.get("/")
    def serve_frontend():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


# ── Run ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", PORT))
    uvicorn.run("main:app", host=HOST, port=port, reload=True)
