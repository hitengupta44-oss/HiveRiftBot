/* ═══════════════════════════════════════════════════════════════════════
   Hive Chatbot — Frontend Logic
   ═══════════════════════════════════════════════════════════════════════ */

const API_BASE = "http://localhost:8000";

// ── DOM Elements ────────────────────────────────────────────────────
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const clearChat = document.getElementById("clearChat");
const welcomeScreen = document.getElementById("welcomeScreen");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const sidebarToggle = document.getElementById("sidebarToggle");
const mobileMenu = document.getElementById("mobileMenu");
const sidebar = document.getElementById("sidebar");

// ── State ───────────────────────────────────────────────────────────
let isWaiting = false;

// ── Initialize ──────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 15000);
    bindEvents();
});

function bindEvents() {
    // Send button
    sendBtn.addEventListener("click", handleSend);

    // Enter to send (Shift+Enter for newline)
    chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // Enable/disable send button
    chatInput.addEventListener("input", () => {
        sendBtn.disabled = !chatInput.value.trim();
        autoResize(chatInput);
    });

    // Clear chat
    clearChat.addEventListener("click", handleClear);

    // Sidebar toggle
    sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("collapsed"));
    mobileMenu.addEventListener("click", () => sidebar.classList.toggle("open"));

    // Click outside sidebar on mobile to close
    document.addEventListener("click", (e) => {
        if (window.innerWidth <= 768 && sidebar.classList.contains("open")) {
            if (!sidebar.contains(e.target) && e.target !== mobileMenu) {
                sidebar.classList.remove("open");
            }
        }
    });

    // Suggestion buttons (welcome screen)
    document.querySelectorAll(".suggestion-btn, .chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const query = btn.dataset.query;
            if (query) {
                chatInput.value = query;
                sendBtn.disabled = false;
                handleSend();
                // Close mobile sidebar if open
                sidebar.classList.remove("open");
            }
        });
    });
}

// ── Auto-resize textarea ────────────────────────────────────────────
function autoResize(el) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

// ── Health Check ────────────────────────────────────────────────────
async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        if (data.rag_ready) {
            statusDot.className = "status-dot online";
            statusText.textContent = "Knowledge Base Ready";
        } else {
            statusDot.className = "status-dot";
            statusText.textContent = "Loading KB...";
        }
    } catch {
        statusDot.className = "status-dot offline";
        statusText.textContent = "Backend Offline";
    }
}

// ── Send Message ────────────────────────────────────────────────────
async function handleSend() {
    const message = chatInput.value.trim();
    if (!message || isWaiting) return;

    // Hide welcome screen
    if (welcomeScreen) {
        welcomeScreen.style.display = "none";
    }

    // Add user message
    appendMessage("user", message);
    chatInput.value = "";
    chatInput.style.height = "auto";
    sendBtn.disabled = true;
    isWaiting = true;

    // Show typing indicator
    const typingEl = showTypingIndicator();

    try {
        const res = await fetch(`${API_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Remove typing indicator
        typingEl.remove();

        // Add bot response
        appendBotMessage(data.reply, data.source, data.chunks_used || []);
    } catch (err) {
        typingEl.remove();
        appendBotMessage(
            "⚠️ Could not connect to the backend. Make sure the server is running on http://localhost:8000",
            "fallback",
            []
        );
    } finally {
        isWaiting = false;
    }
}

// ── Append User Message ─────────────────────────────────────────────
function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = `message ${role}`;

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.textContent = role === "user" ? "U" : "";
    if (role === "bot") {
        avatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#818cf8"/>
            <path d="M2 17L12 22L22 17" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
            <path d="M2 12L12 17L22 12" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
        </svg>`;
    }

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;

    content.appendChild(bubble);
    div.appendChild(avatar);
    div.appendChild(content);
    chatMessages.appendChild(div);
    scrollToBottom();
}

// ── Append Bot Message with Source Badge ─────────────────────────────
function appendBotMessage(text, source, chunks) {
    const div = document.createElement("div");
    div.className = "message bot";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#818cf8"/>
        <path d="M2 17L12 22L22 17" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
        <path d="M2 12L12 17L22 12" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

    const content = document.createElement("div");
    content.className = "message-content";

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.textContent = text;
    content.appendChild(bubble);

    // Source badge
    const badge = document.createElement("span");
    badge.className = `source-badge ${source}`;
    const labels = {
        kb: "📚 Knowledge Base",
        generic: "💬 General",
        fallback: "⚠️ No Match",
        system: "⚙️ System",
    };
    badge.textContent = labels[source] || source;
    content.appendChild(badge);

    // Sources accordion (only for KB results)
    if (chunks && chunks.length > 0) {
        const toggle = document.createElement("button");
        toggle.className = "sources-toggle";
        toggle.innerHTML = `<span class="arrow">▶</span> View ${chunks.length} source${chunks.length > 1 ? "s" : ""}`;

        const sourcesList = document.createElement("div");
        sourcesList.className = "sources-list";

        chunks.forEach((chunk) => {
            const item = document.createElement("div");
            item.className = "source-item";
            item.innerHTML = `
                <span class="source-name">${escapeHtml(chunk.source)} <span class="source-score">Score: ${chunk.score}</span></span>
                ${escapeHtml(chunk.text.substring(0, 200))}${chunk.text.length > 200 ? "…" : ""}
            `;
            sourcesList.appendChild(item);
        });

        toggle.addEventListener("click", () => {
            toggle.classList.toggle("open");
            sourcesList.classList.toggle("visible");
        });

        content.appendChild(toggle);
        content.appendChild(sourcesList);
    }

    div.appendChild(avatar);
    div.appendChild(content);
    chatMessages.appendChild(div);
    scrollToBottom();
}

// ── Typing Indicator ────────────────────────────────────────────────
function showTypingIndicator() {
    const div = document.createElement("div");
    div.className = "typing-indicator";

    const avatar = document.createElement("div");
    avatar.className = "message-avatar";
    avatar.style.background = "var(--accent-glow)";
    avatar.style.border = "1px solid var(--border-primary)";
    avatar.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#818cf8"/>
        <path d="M2 17L12 22L22 17" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
        <path d="M2 12L12 17L22 12" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>
    </svg>`;

    const dots = document.createElement("div");
    dots.className = "typing-dots";
    dots.innerHTML = "<span></span><span></span><span></span>";

    div.appendChild(avatar);
    div.appendChild(dots);
    chatMessages.appendChild(div);
    scrollToBottom();
    return div;
}

// ── Clear Chat ──────────────────────────────────────────────────────
function handleClear() {
    chatMessages.innerHTML = "";
    // Re-add welcome screen
    chatMessages.innerHTML = `
        <div class="welcome-screen" id="welcomeScreen">
            <div class="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#wg1)"/>
                    <path d="M2 17L12 22L22 17" stroke="url(#wg2)" stroke-width="2" stroke-linecap="round"/>
                    <path d="M2 12L12 17L22 12" stroke="url(#wg2)" stroke-width="2" stroke-linecap="round"/>
                    <defs>
                        <linearGradient id="wg1" x1="2" y1="2" x2="22" y2="12">
                            <stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/>
                        </linearGradient>
                        <linearGradient id="wg2" x1="2" y1="12" x2="22" y2="22">
                            <stop stop-color="#6366f1"/><stop offset="1" stop-color="#a855f7"/>
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <h2>Welcome to Hive Assistant</h2>
            <p>Ask me anything about our services, pricing, hosting, SSL, sales processes, or team roles.</p>
            <div class="welcome-suggestions">
                <button class="suggestion-btn" data-query="What services does the company offer?">
                    <span class="suggestion-icon">🏢</span><span>What services do you offer?</span>
                </button>
                <button class="suggestion-btn" data-query="What are the pricing plans?">
                    <span class="suggestion-icon">💰</span><span>Tell me about pricing plans</span>
                </button>
                <button class="suggestion-btn" data-query="Explain the hosting options">
                    <span class="suggestion-icon">🌐</span><span>Hosting & domain options</span>
                </button>
                <button class="suggestion-btn" data-query="What is the sales process?">
                    <span class="suggestion-icon">📋</span><span>How does the sales process work?</span>
                </button>
            </div>
        </div>
    `;

    // Re-bind suggestion buttons
    document.querySelectorAll(".suggestion-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const query = btn.dataset.query;
            if (query) {
                chatInput.value = query;
                sendBtn.disabled = false;
                handleSend();
            }
        });
    });
}

// ── Utilities ───────────────────────────────────────────────────────
function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
