import { useEffect, useState, useRef } from "react";
import { BACKEND_URL } from "../utils/apiurl.ts";
import { connectWebSocket } from "../websockets/connect.ts";
import "./JoinRoom.css";

// ─── Types ───────────────────────────────────────────────────────────────────
type Step = "auth" | "join" | "connecting" | "done";
type AuthMode = "signin" | "signup";
type RoomMode = "join" | "create";
type Status = "idle" | "loading" | "error" | "success";

type PresenceUser = {
  name: string;
  status: "online" | "offline";
};

interface JoinRoomProps {
  onAuthenticated?: (user: { name: string; email: string }) => void;
  onConnected?: (ws: WebSocket, name: string, roomcode: string) => void;
  onPresence?: (users: PresenceUser[]) => void;
  onMessage?: (raw: string) => void;
  onClose?: () => void;
  fullPage?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function JoinRoom({ onAuthenticated, onConnected, onPresence, onMessage, onClose, fullPage = false }: JoinRoomProps) {
  // Step navigation
  const [step, setStep] = useState<Step>("auth");
  const [authMode, setAuthMode] = useState<AuthMode>("signin");

  // Auth fields
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");

  // Room fields — name carried forward from auth
  const [loggedInName, setLoggedInName] = useState("");
  const [roomcode, setRoomcode] = useState("");
  const [roomMode, setRoomMode] = useState<RoomMode>("join");
  // Create-room extra fields
  const [roomName, setRoomName] = useState("");
  const [roomDescription, setRoomDescription] = useState("");

  // UI state
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/user/me`, { credentials: "include" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          return;
        }

        setLoggedInName(data.user.name);
        setRoomMode("create");
        setStep("join");
      })
      .catch(() => {
        // Keep the auth form available when the backend is temporarily offline.
      });
  }, []);

  // ─── Auth handler ─────────────────────────────────────────────────────────
  async function handleAuth() {
    const isSignup = authMode === "signup";

    if (!authEmail.trim() || !authPassword.trim()) {
      setStatus("error");
      setMessage("Please fill in all required fields.");
      return;
    }
    if (isSignup && !authName.trim()) {
      setStatus("error");
      setMessage("Please enter your name.");
      return;
    }

    setStatus("loading");
    setMessage(isSignup ? "Creating account..." : "Signing in...");

    try {
      const endpoint = isSignup ? "/user/signup" : "/user/signin";
      const body = isSignup
        ? { name: authName, email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword };

      const res = await fetch(`${BACKEND_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!data.success) {
        setStatus("error");
        setMessage(data.message || "Authentication failed.");
        return;
      }

      // On signin we need a name — use the email prefix as fallback,
      // but for signup we have authName directly.
      const resolvedName = data.user?.name ?? (isSignup
        ? authName
        : authEmail.split("@")[0]);

      if (onAuthenticated) {
        onAuthenticated({ name: resolvedName, email: data.user?.email ?? authEmail });
        onClose?.();
        return;
      }

      setLoggedInName(resolvedName);
      setRoomMode("create");
      setStatus("success");
      setMessage(isSignup ? "Account created! Now join a room." : "Signed in! Now join a room.");

      // Auto-advance to join step after brief delay
      setTimeout(() => {
        setStatus("idle");
        setMessage("");
        setStep("join");
      }, 800);
    } catch {
      setStatus("error");
      setMessage("Network error. Is the backend running on port 3000?");
    }
  }

  // ─── Create Room handler ─────────────────────────────────────────────────
  async function handleCreate() {
    if (!/^\d{4}$/.test(roomcode)) {
      setStatus("error");
      setMessage("Room code must contain exactly 4 digits.");
      return;
    }
    if (!roomcode.trim() || !roomName.trim() || !roomDescription.trim()) {
      setStatus("error");
      setMessage("Please fill in room name, description and room code.");
      return;
    }

    setStatus("loading");
    setMessage("Creating room...");

    try {
      const res = await fetch(`${BACKEND_URL}/room/createroom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: roomName,
          description: roomDescription,
          roomcode,
          active: true,
        }),
      });

      const data = await res.json();

      if (!data.success) {
        setStatus("error");
        setMessage(data.message || "Failed to create room.");
        return;
      }

      // Room created — connect WebSocket
      openWebSocket();
    } catch {
      setStatus("error");
      setMessage("Network error. Make sure the backend is running.");
    }
  }

  // ─── Join Room handler ────────────────────────────────────────────────────
  async function handleJoin() {
    if (!/^\d{4}$/.test(roomcode)) {
      setStatus("error");
      setMessage("Room code must contain exactly 4 digits.");
      return;
    }
    if (!roomcode.trim()) {
      setStatus("error");
      setMessage("Please enter a room code.");
      return;
    }

    setStatus("loading");
    setMessage("Validating room...");

    try {
      const res = await fetch(`${BACKEND_URL}/room/validatingroomcode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ roomcode, name: loggedInName }),
      });

      const data = await res.json();

      if (!data.success) {
        setStatus("error");
        setMessage(data.message || "Room validation failed.");
        return;
      }

      openWebSocket();
    } catch {
      setStatus("error");
      setMessage("Network error. Make sure the backend is running.");
    }
  }

  // ─── Shared WebSocket opener (called by both join and create) ─────────────
  function openWebSocket() {
    setStep("connecting");
    setStatus("loading");
    setMessage("Opening connection...");

    const ws = connectWebSocket(roomcode, loggedInName, (raw) => {
      onMessage?.(raw);
      try {
        const event = JSON.parse(raw);
        if (event.type === "presence" && Array.isArray(event.users)) {
          onPresence?.(event.users);
        }
      } catch {
        console.warn("[WS] Ignored invalid message", raw);
      }
    });
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setStep("done");
      setStatus("success");
      setMessage("Connected! Starting camera...");
      onConnected?.(ws, loggedInName, roomcode);
      setTimeout(() => onClose?.(), 1200);
    });

    ws.addEventListener("error", () => {
      setStep("join");
      setStatus("error");
      setMessage("WebSocket failed. Is the backend running on port 8080?");
    });
  }

  // ─── Keyboard submit ──────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "auth") handleAuth();
      if (step === "join") {
        if (roomMode === "join") handleJoin();
        else handleCreate();
      }
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      className={`jr-overlay ${fullPage ? "jr-overlay--page" : ""}`}
      onClick={(e) => !fullPage && e.target === e.currentTarget && onClose?.()}
    >
      {fullPage && (
        <aside className="jr-page-intro">
          <a className="jr-page-brand" href="#top" onClick={onClose}>
            <span className="jr-page-brand-mark"><span /></span>
            <span>codesketch</span>
          </a>
          <div>
            <p className="jr-page-kicker">Your shared space starts here</p>
            <h1>Make room<br /><em>for ideas.</em></h1>
            <p className="jr-page-copy">Sign in, create your room, and bring your team into the same train of thought.</p>
          </div>
          <p className="jr-page-flow">Sign in <span>→</span> create a room <span>→</span> start sketching</p>
        </aside>
      )}
      <div className="jr-panel" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="jr-header">
          <div>
            <h2 className="jr-title">
              {step === "auth" && (authMode === "signin" ? "Sign In" : "Sign Up")}
              {step === "join" && (roomMode === "join" ? "Join a Room" : "Create a Room")}
              {step === "connecting" && "Connecting..."}
              {step === "done" && "Connected! 🎉"}
            </h2>
            <p className="jr-subtitle">
              {step === "auth" && "Access your Codesketch account"}
              {step === "join" && roomMode === "join" && `Welcome, ${loggedInName}! Enter a room code to join.`}
              {step === "join" && roomMode === "create" && `Welcome, ${loggedInName}! Set up your new room.`}
              {step === "connecting" && "Please wait..."}
              {step === "done" && "Camera will start shortly"}
            </p>
          </div>
          <button
            id="jr-close-btn"
            onClick={onClose}
            className="jr-close"
            aria-label={fullPage ? "Back to home" : "Close"}
          >
            {fullPage ? "Back" : "✕"}
          </button>
        </div>

        {/* ── STEP 1: Auth ─────────────────────────────────────────── */}
        {step === "auth" && (
          <>
            {/* Mode toggle */}
            <div className="jr-toggle">
              <button
                id="jr-toggle-signin"
                className={`jr-toggle-btn ${authMode === "signin" ? "jr-toggle-btn--active" : ""}`}
                onClick={() => { setAuthMode("signin"); setMessage(""); setStatus("idle"); }}
              >
                Sign In
              </button>
              <button
                id="jr-toggle-signup"
                className={`jr-toggle-btn ${authMode === "signup" ? "jr-toggle-btn--active" : ""}`}
                onClick={() => { setAuthMode("signup"); setMessage(""); setStatus("idle"); }}
              >
                Sign Up
              </button>
            </div>

            {authMode === "signin" && (
              <button
                type="button"
                className="jr-demo-btn"
                onClick={() => {
                  setAuthEmail("demo@gmail.com");
                  setAuthPassword("demo");
                  setMessage("Demo account loaded. Ready to sign in.");
                  setStatus("idle");
                }}
              >
                <span>Try the demo account</span>
                <small>demo@codesketch.local</small>
              </button>
            )}

            <div className="jr-fields">
              {authMode === "signup" && (
                <div className="jr-field">
                  <label className="jr-label">Name</label>
                  <input
                    id="jr-name"
                    className="jr-input"
                    type="text"
                    placeholder="e.g. rahul"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    disabled={status === "loading"}
                    autoFocus
                  />
                </div>
              )}
              <div className="jr-field">
                <label className="jr-label">Email</label>
                <input
                  id="jr-email"
                  className="jr-input"
                  type="email"
                  placeholder="e.g. rahul@gmail.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  disabled={status === "loading"}
                  autoFocus={authMode === "signin"}
                />
              </div>
              <div className="jr-field">
                <label className="jr-label">Password</label>
                <input
                  id="jr-password"
                  className="jr-input"
                  type="password"
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  disabled={status === "loading"}
                />
              </div>
            </div>

            {message && (
              <div className={`jr-message jr-message--${status}`}>
                {status === "loading" && <span className="jr-spinner" />}
                {message}
              </div>
            )}

            <button
              id="jr-auth-btn"
              className="jr-btn jr-btn--primary"
              onClick={handleAuth}
              disabled={status === "loading"}
            >
              {status === "loading"
                ? "Please wait..."
                : authMode === "signin"
                ? "Sign In"
                : "Create Account"}
            </button>
          </>
        )}

        {/* ── STEP 2: Create or Join Room ───────────────────────────── */}
        {step === "join" && (
          <>
            {/* Mode toggle */}
            <div className="jr-toggle">
              <button
                id="jr-mode-join"
                className={`jr-toggle-btn ${roomMode === "join" ? "jr-toggle-btn--active" : ""}`}
                onClick={() => { setRoomMode("join"); setMessage(""); setStatus("idle"); }}
              >
                Join Room
              </button>
              <button
                id="jr-mode-create"
                className={`jr-toggle-btn ${roomMode === "create" ? "jr-toggle-btn--active" : ""}`}
                onClick={() => { setRoomMode("create"); setMessage(""); setStatus("idle"); }}
              >
                Create Room
              </button>
            </div>

            <div className="jr-fields">
              {/* Common: username (read-only reference) */}
              <div className="jr-field">
                <label className="jr-label">Username</label>
                <input
                  id="jr-username"
                  className="jr-input"
                  type="text"
                  value={loggedInName}
                  onChange={(e) => setLoggedInName(e.target.value)}
                  disabled={status === "loading"}
                />
              </div>

              {/* Create-only fields */}
              {roomMode === "create" && (
                <>
                  <div className="jr-field">
                    <label className="jr-label">Room Name</label>
                    <input
                      id="jr-room-name"
                      className="jr-input"
                      type="text"
                      placeholder="e.g. Design Session"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      disabled={status === "loading"}
                      autoFocus
                    />
                  </div>
                  <div className="jr-field">
                    <label className="jr-label">Description</label>
                    <input
                      id="jr-room-desc"
                      className="jr-input"
                      type="text"
                      placeholder="e.g. Weekly whiteboard session"
                      value={roomDescription}
                      onChange={(e) => setRoomDescription(e.target.value)}
                      disabled={status === "loading"}
                    />
                  </div>
                </>
              )}

              {/* Common: room code */}
              <div className="jr-field">
                <label className="jr-label">Room Code</label>
                <input
                  id="jr-roomcode"
                  className="jr-input"
                  type="text"
                  placeholder="e.g. 9912"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={roomcode}
                  onChange={(e) => setRoomcode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  disabled={status === "loading"}
                  autoFocus={roomMode === "join"}
                />
              </div>
            </div>

            {message && (
              <div className={`jr-message jr-message--${status}`}>
                {status === "loading" && <span className="jr-spinner" />}
                {message}
              </div>
            )}

            <div className="jr-actions">
              <button
                id="jr-back-btn"
                className="jr-btn jr-btn--ghost"
                onClick={() => { setStep("auth"); setStatus("idle"); setMessage(""); }}
              >
                ← Back
              </button>
              <button
                id="jr-room-action-btn"
                className="jr-btn jr-btn--primary"
                onClick={roomMode === "join" ? handleJoin : handleCreate}
                disabled={status === "loading"}
              >
                {status === "loading"
                  ? roomMode === "join" ? "Validating..." : "Creating..."
                  : roomMode === "join" ? "Enter Room" : "Create & Enter"}
              </button>
            </div>
          </>
        )}


        {/* ── STEP 3: Connecting / Done ─────────────────────────────── */}
        {(step === "connecting" || step === "done") && (
          <div className="jr-connecting">
            {step === "connecting" ? (
              <div className="jr-pulse-ring" />
            ) : (
              <div className="jr-check">✓</div>
            )}
            <p className="jr-connecting-text">{message}</p>
          </div>
        )}
      </div>
    </div>
  );
}
