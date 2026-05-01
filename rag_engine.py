"""
RAG Engine — built from scratch with TF-IDF + Cosine Similarity.

No LLM required. Retrieves the most relevant chunks from the Knowledge Base
and returns them as the answer. Generic / off-topic questions are handled
separately with pattern-based responses.
"""

import os
import re
import glob
from dataclasses import dataclass

import numpy as np
from docx import Document as DocxDocument
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from config import (
    KNOWLEDGE_BASE_DIR,
    CHUNK_SIZE,
    CHUNK_OVERLAP,
    TOP_K,
    SIMILARITY_THRESHOLD,
)


# ── Data Structures ────────────────────────────────────────────────────
@dataclass
class Chunk:
    """A text chunk with metadata about its source."""
    text: str
    source: str          # filename it came from
    chunk_index: int     # position within the document


# ── Generic / Small-Talk Responder ──────────────────────────────────────
GENERIC_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"\b(hi|hello|hey|greetings)\b", re.I),
     "Hello! 👋 I'm the Hive assistant. Ask me anything about our services, pricing, hosting, or team processes."),
    (re.compile(r"\bhow are you\b", re.I),
     "I'm doing great, thanks for asking! How can I help you today?"),
    (re.compile(r"\b(thanks|thank you|thx)\b", re.I),
     "You're welcome! Let me know if you have more questions. 😊"),
    (re.compile(r"\b(bye|goodbye|see you)\b", re.I),
     "Goodbye! Feel free to come back anytime. 👋"),
    (re.compile(r"\bwho (are you|made you|built you|created you)\b", re.I),
     "I'm the Hive chatbot — your smart assistant for all things related to our company services, pricing, hosting, SSL, and team processes."),
    (re.compile(r"\bwhat can you do\b", re.I),
     "I can answer questions about our company services, pricing plans, hosting & SSL details, sales SOPs, and team roles. Just ask away!"),
    (re.compile(r"\bhelp\b", re.I),
     "Sure! You can ask me about:\n• Company services & pricing\n• Sales SOPs & team roles\n• Technical hosting, SSL & domains\n\nJust type your question!"),
]


def check_generic(query: str) -> str | None:
    """Return a canned response if the query matches a generic pattern."""
    for pattern, response in GENERIC_PATTERNS:
        if pattern.search(query):
            return response
    return None


# ── Document Loading ────────────────────────────────────────────────────
def load_documents() -> list[dict]:
    """
    Load all .docx files from the Knowledge Base directory.
    Returns a list of dicts: { "filename": str, "text": str }
    """
    docs = []
    docx_files = glob.glob(os.path.join(KNOWLEDGE_BASE_DIR, "*.docx"))

    if not docx_files:
        raise FileNotFoundError(
            f"No .docx files found in '{KNOWLEDGE_BASE_DIR}'. "
            "Please add your Knowledge Base documents."
        )

    for filepath in docx_files:
        doc = DocxDocument(filepath)
        paragraphs = [p.text.strip() for p in doc.paragraphs if p.text.strip()]
        full_text = "\n".join(paragraphs)
        docs.append({
            "filename": os.path.basename(filepath),
            "text": full_text,
        })

    print(f"[RAG] Loaded {len(docs)} documents from Knowledge Base.")
    return docs


# ── Text Chunking ───────────────────────────────────────────────────────
def chunk_text(text: str, source: str,
               chunk_size: int = CHUNK_SIZE,
               overlap: int = CHUNK_OVERLAP) -> list[Chunk]:
    """Split text into overlapping chunks."""
    chunks = []
    start = 0
    idx = 0
    while start < len(text):
        end = start + chunk_size
        chunk_str = text[start:end]
        if chunk_str.strip():
            chunks.append(Chunk(text=chunk_str.strip(), source=source, chunk_index=idx))
            idx += 1
        start += chunk_size - overlap
    return chunks


def build_chunks(documents: list[dict]) -> list[Chunk]:
    """Chunk all documents."""
    all_chunks: list[Chunk] = []
    for doc in documents:
        all_chunks.extend(chunk_text(doc["text"], doc["filename"]))
    print(f"[RAG] Created {len(all_chunks)} chunks.")
    return all_chunks


# ── TF-IDF Vector Store ────────────────────────────────────────────────
class VectorStore:
    """A simple TF-IDF based vector store for document retrieval."""

    def __init__(self):
        self.vectorizer = TfidfVectorizer(
            stop_words="english",
            ngram_range=(1, 2),     # unigrams + bigrams for better matching
            max_df=0.95,
            min_df=1,
            sublinear_tf=True,
        )
        self.chunks: list[Chunk] = []
        self.tfidf_matrix = None

    def build(self, chunks: list[Chunk]):
        """Build the TF-IDF matrix from chunks."""
        self.chunks = chunks
        texts = [c.text for c in chunks]
        self.tfidf_matrix = self.vectorizer.fit_transform(texts)
        print(f"[RAG] TF-IDF matrix built: {self.tfidf_matrix.shape}")

    def search(self, query: str, top_k: int = TOP_K) -> list[tuple[Chunk, float]]:
        """
        Search for the most relevant chunks.
        Returns list of (Chunk, similarity_score) sorted by score descending.
        """
        query_vec = self.vectorizer.transform([query])
        similarities = cosine_similarity(query_vec, self.tfidf_matrix).flatten()
        top_indices = np.argsort(similarities)[::-1][:top_k]

        results = []
        for i in top_indices:
            score = float(similarities[i])
            if score > 0:
                results.append((self.chunks[i], score))

        return results


# ── RAG Engine ──────────────────────────────────────────────────────────
class RAGEngine:
    """
    The main RAG engine.
    1. Checks if query is generic (greetings, help, etc.) → returns canned response
    2. Does TF-IDF retrieval from the Knowledge Base
    3. If similarity is above threshold → returns KB answer
    4. If below threshold → returns a polite "I don't know" with suggestions
    """

    def __init__(self):
        self.vector_store = VectorStore()
        self.is_ready = False

    def initialize(self):
        """Load documents, chunk them, and build vector store."""
        documents = load_documents()
        chunks = build_chunks(documents)
        self.vector_store.build(chunks)
        self.is_ready = True
        print("[RAG] Engine initialized and ready!")

    def query(self, user_query: str) -> dict:
        """
        Process a user query and return a response.
        Returns: {
            "reply": str,
            "source": "kb" | "generic" | "fallback",
            "chunks_used": list[dict] (only for kb source)
        }
        """
        if not self.is_ready:
            return {
                "reply": "⚠️ The knowledge base is still loading. Please try again in a moment.",
                "source": "system",
                "chunks_used": [],
            }

        # 1. Check for generic / small-talk
        generic_reply = check_generic(user_query)
        if generic_reply:
            return {
                "reply": generic_reply,
                "source": "generic",
                "chunks_used": [],
            }

        # 2. Retrieve from Knowledge Base
        results = self.vector_store.search(user_query, top_k=TOP_K)

        if not results or results[0][1] < SIMILARITY_THRESHOLD:
            return {
                "reply": (
                    "I couldn't find a relevant answer in our Knowledge Base for your question. "
                    "Try asking about:\n"
                    "• Our services & pricing plans\n"
                    "• Sales SOPs & team roles\n"
                    "• Hosting, SSL & domain details"
                ),
                "source": "fallback",
                "chunks_used": [],
            }

        # 3. Build answer from retrieved chunks
        answer_parts = []
        chunks_used = []
        for chunk, score in results:
            if score >= SIMILARITY_THRESHOLD:
                answer_parts.append(chunk.text)
                chunks_used.append({
                    "text": chunk.text,
                    "source": chunk.source,
                    "score": round(score, 4),
                })

        combined_answer = "\n\n".join(answer_parts)

        return {
            "reply": combined_answer,
            "source": "kb",
            "chunks_used": chunks_used,
        }
