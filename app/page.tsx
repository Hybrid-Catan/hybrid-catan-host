"use client";
import { useRef, useState } from "react";

interface MiniHexProps {
  x: number; y: number; size: number; fill: string;
  opacity?: number; stroke?: string;
}
const MiniHex = ({ x, y, size, fill, opacity = 1, stroke = "transparent" }: MiniHexProps) => {
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${x + size * Math.cos(a)},${y + size * Math.sin(a)}`;
  }).join(" ");
  return <polygon points={pts} fill={fill} stroke={stroke} strokeWidth="1" opacity={opacity} />;
};

interface HexBtnProps {
  children: React.ReactNode; primary?: boolean;
  onClick?: () => void; className?: string; disabled?: boolean;
}
const HexBtn = ({ children, primary = false, onClick, className = "", disabled = false }: HexBtnProps) => (
  <button
    onClick={onClick} disabled={disabled}
    className={`relative inline-flex items-center justify-center gap-2 px-8 py-3
      font-bold tracking-[0.15em] uppercase text-sm border-0 outline-none cursor-pointer
      transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed
      ${primary
        ? "bg-gradient-to-br from-[#D4921E] to-[#A86B10] text-[#0E1117] hover:from-[#E8A52A] hover:to-[#C07E18] hover:scale-105 disabled:hover:scale-100"
        : "bg-transparent border border-[#38BDF8]/40 text-[#38BDF8] hover:border-[#38BDF8] hover:bg-[#38BDF8]/10"
      } ${className}`}
    style={{ clipPath: "polygon(12px 0%,100% 0%,calc(100% - 12px) 100%,0% 100%)" }}
  >
    {children}
  </button>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-center gap-3 mb-4">
    <div className="h-px w-10 bg-gradient-to-r from-transparent to-[#C8861A]" />
    <span className="text-[#C8861A] text-[11px] tracking-[0.45em] uppercase font-bold" style={{ fontFamily: "'Cinzel', serif" }}>
      {children}
    </span>
    <div className="h-px w-10 bg-gradient-to-l from-transparent to-[#C8861A]" />
  </div>
);

type StatusType = "idle" | "connecting" | "live" | "error";
const STATUS_MAP: Record<StatusType, { dot: string; text: string; label: string }> = {
  idle: { dot: "bg-[#2A3347]", text: "text-[#4A5875]", label: "Awaiting Connection" },
  connecting: { dot: "bg-yellow-400", text: "text-yellow-400", label: "Connecting…" },
  live: { dot: "bg-emerald-500", text: "text-emerald-400", label: "Camera Live" },
  error: { dot: "bg-red-500", text: "text-red-400", label: "Connection Failed" },
};
const StatusPill = ({ status }: { status: StatusType }) => {
  const s = STATUS_MAP[status];
  return (
    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded border border-[#2A3347] bg-[#0A0F18]">
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${status === "live" || status === "connecting" ? "animate-pulse" : ""}`} />
      <span className={`f-cinzel text-[10px] tracking-[0.35em] uppercase ${s.text}`}>{s.label}</span>
    </div>
  );
};

const InfoRow = ({ icon, label, value, accent = "amber" }: { icon: string; label: string; value: string; accent?: "amber" | "cyan" }) => (
  <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm
    ${accent === "amber" ? "border-[#C8861A]/20 bg-[#C8861A]/05" : "border-[#38BDF8]/20 bg-[#38BDF8]/05"}`}>
    <span className="text-base">{icon}</span>
    <span className="f-cinzel text-[10px] tracking-widest uppercase text-[#4A5875] flex-1">{label}</span>
    <span className={`f-cinzel text-xs font-black ${accent === "amber" ? "text-[#F0C060]" : "text-[#7DD3FC]"}`}>{value}</span>
  </div>
);

interface LogEntry { ts: string; msg: string; type: "info" | "success" | "warn" | "error"; }
const LOG_COLORS: Record<LogEntry["type"], string> = {
  info: "text-[#6B7A99]", success: "text-emerald-400", warn: "text-yellow-400", error: "text-red-400",
};

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

interface PlayerState {
  pc: RTCPeerConnection;
  remoteDescSet: boolean;
  iceCandidateBuffer: RTCIceCandidateInit[];
}

export default function Host() {
  const socketRef = useRef<WebSocket | null>(null);
  const gameIdRef = useRef<string | null>(null);
  const playersRef = useRef<Map<number, PlayerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<StatusType>("idle");
  const [logs, setLogs] = useState<LogEntry[]>([{ ts: now(), msg: "System ready — press Connect to start.", type: "info" }]);
  const [players, setPlayers] = useState(0);
  const [gameId, setGameId] = useState<string | null>(null);



  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cvSocketRef = useRef<WebSocket | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const [cvStatus, setCvStatus] = useState<"idle" | "processing" | "no_board" | "error">("idle");
  function startCVLoop(stream: MediaStream, cvWsUrl: string) {
    const offscreen = document.createElement("canvas");
    offscreen.width = 1280;
    offscreen.height = 720;
    const ctx = offscreen.getContext("2d")!;

    const vid = document.getElementById("localVideo") as HTMLVideoElement;

    const cvSocket = new WebSocket(cvWsUrl);
    cvSocket.binaryType = "arraybuffer";
    cvSocketRef.current = cvSocket;

    let waiting = false; // backpressure: only send next frame when reply arrives

    cvSocket.onopen = () => {
      addLog("CV WebSocket connected.", "success");
      setCvStatus("processing");
    };

    cvSocket.onmessage = (e) => {
      waiting = false;
      if (e.data instanceof ArrayBuffer) {
        const blob = new Blob([e.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const c = canvas.getContext("2d")!;
          c.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
        };
        img.src = url;
        setCvStatus("processing");
      } else {
        // JSON error message
        try {
          const msg = JSON.parse(
            typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data)
          );
          if (msg.error === "no_board") setCvStatus("no_board");
          else setCvStatus("error");
        } catch { }
      }
    };

    cvSocket.onerror = () => { addLog("CV WebSocket error.", "error"); setCvStatus("error"); };
    cvSocket.onclose = () => { addLog("CV WebSocket closed.", "warn"); };

    // Capture + send frames at ~10 FPS (100ms interval — CV is the bottleneck)
    frameLoopRef.current = window.setInterval(() => {
      if (waiting || cvSocket.readyState !== WebSocket.OPEN) return;
      if (!vid.videoWidth) return;
      offscreen.width = vid.videoWidth;
      offscreen.height = vid.videoHeight;
      ctx.drawImage(vid, 0, 0);
      offscreen.toBlob((blob) => {
        if (!blob) return;
        blob.arrayBuffer().then((buf) => {
          if (cvSocket.readyState === WebSocket.OPEN) {
            cvSocket.send(buf);
            waiting = true;
          }
        });
      }, "image/jpeg", 0.85);
    }, 100);
  }
  function stopCVLoop() {
    if (frameLoopRef.current) { clearInterval(frameLoopRef.current); frameLoopRef.current = null; }
    cvSocketRef.current?.close();
    cvSocketRef.current = null;
    setCvStatus("idle");
  }
  function addLog(msg: string, type: LogEntry["type"] = "info") {
    setLogs(l => [{ ts: now(), msg, type }, ...l].slice(0, 40));
  }

  // ── Shared WebSocket + PeerConnection setup ──────────────────────────────
  function setupSocket(id: string, stream: MediaStream) {
    const wsUrl = process.env.NEXT_PUBLIC_HOST_WS!;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    addLog(`Connecting to signaling server: ${wsUrl}`, "info");

    socket.onopen = () => {
      addLog("Signaling socket opened. Registering room…", "success");
      socket.send(JSON.stringify({ type: "register_host", gameId: id }));
      setStatus("live");
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      const currentGid = gameIdRef.current;

      if (data.type === "player_joined") {
        const pidx = data.playerIndex;
        setPlayers(p => p + 1);
        addLog(`Player ${pidx} detected — initiating handshake…`, "success");

        const localStream = localStreamRef.current;
        if (!localStream) { addLog("No local stream — cannot create offer.", "error"); return; }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const playerState: PlayerState = { pc, remoteDescSet: false, iceCandidateBuffer: [] };
        playersRef.current.set(pidx, playerState);

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

        pc.onicecandidate = (e) => {
          if (e.candidate && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ice", candidate: e.candidate, gameId: currentGid, playerIndex: pidx }));
          }
        };

        pc.oniceconnectionstatechange = () => {
          const state = pc.iceConnectionState;
          addLog(`ICE [player ${pidx}] → ${state}`,
            state === "connected" || state === "completed" ? "success" : state === "failed" ? "error" : "info");
          if (state === "failed") pc.restartIce();
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.send(JSON.stringify({ type: "offer", offer, gameId: currentGid, playerIndex: pidx }));
        addLog(`SDP offer sent to player ${pidx}.`, "info");

      } else if (data.type === "answer") {
        if (data.gameId !== currentGid) return;
        const ps = playersRef.current.get(data.playerIndex);
        if (!ps) { addLog(`Answer for unknown playerIndex ${data.playerIndex}.`, "warn"); return; }

        await ps.pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        ps.remoteDescSet = true;

        if (ps.iceCandidateBuffer.length > 0) {
          addLog(`Flushing ${ps.iceCandidateBuffer.length} buffered ICE candidate(s) for player ${data.playerIndex}…`, "info");
          for (const c of ps.iceCandidateBuffer) {
            await ps.pc.addIceCandidate(new RTCIceCandidate(c)).catch(e => console.warn("Buffered ICE error", e));
          }
          ps.iceCandidateBuffer = [];
        }
        addLog(`Handshake complete for player ${data.playerIndex}.`, "success");

      } else if (data.type === "ice") {
        if (data.gameId !== currentGid || !data.candidate) return;
        const ps = playersRef.current.get(data.playerIndex);
        if (!ps) return;
        if (!ps.remoteDescSet) {
          ps.iceCandidateBuffer.push(data.candidate);
        } else {
          await ps.pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(e => console.error("ICE candidate error", e));
        }
      }
    };

    socket.onerror = () => { addLog("WebSocket error — check NEXT_PUBLIC_HOST_WS.", "error"); setStatus("error"); };
    socket.onclose = () => { addLog("Signaling socket closed.", "warn"); };
  }

  // ── Initial connect ──────────────────────────────────────────────────────
  async function connect() {
    if (status === "live" || status === "connecting") return;
    setStatus("connecting");
    addLog("Requesting camera access…", "info");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (err) {
      addLog(`Camera error: ${(err as Error).message}`, "error");
      setStatus("error");
      return;
    }

    localStreamRef.current = stream;
    const vid = document.getElementById("localVideo") as HTMLVideoElement;
    if (vid) vid.srcObject = stream;
    addLog("Camera stream acquired.", "success");
    const CV_WS = process.env.NEXT_PUBLIC_CV_WS ?? "ws://localhost:8765";
    startCVLoop(stream, CV_WS);

    const id = `CATAN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    gameIdRef.current = id;
    setGameId(id);
    addLog(`Game session created: ${id}`, "success");

    setupSocket(id, stream);
  }

  // ── Rejoin existing session ──────────────────────────────────────────────
  async function rejoin() {
    const id = gameIdRef.current;
    if (!id) return;

    setStatus("connecting");
    addLog("Rejoining session — requesting camera…", "info");

    // Close any stale peer connections
    playersRef.current.forEach(({ pc }) => pc.close());
    playersRef.current.clear();
    setPlayers(0);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (err) {
      addLog(`Camera error: ${(err as Error).message}`, "error");
      setStatus("error");
      return;
    }

    localStreamRef.current = stream;
    const vid = document.getElementById("localVideo") as HTMLVideoElement;
    if (vid) vid.srcObject = stream;
    addLog("Camera re-acquired.", "success");

    // Re-register the same gameId so the server restores the room
    setupSocket(id, stream);
  }

  // ── Disconnect (explicit — notify players first) ─────────────────────────
  function disconnect() {
    const id = gameIdRef.current;
    const socket = socketRef.current;
    stopCVLoop();
    // Gracefully tell the server (and thereby all players) the host is leaving
    if (socket?.readyState === WebSocket.OPEN && id) {
      socket.send(JSON.stringify({ type: "host_leaving", gameId: id }));
      addLog("Notified players of host departure.", "warn");
    }

    // Tear down peer connections
    playersRef.current.forEach(({ pc }) => pc.close());
    playersRef.current.clear();

    socket?.close();
    socketRef.current = null;

    // Stop camera tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    const vid = document.getElementById("localVideo") as HTMLVideoElement;
    if (vid) vid.srcObject = null;

    // Keep gameId in state so the host can rejoin with the same room code
    setStatus("idle");
    setPlayers(0);
    addLog("Session disconnected. Room is inactive but code is preserved.", "warn");
  }

  async function copyJoinLink() {
    if (!gameIdRef.current) { addLog("No active session.", "error"); return; }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/join/${gameIdRef.current}`);
      addLog("Join link copied.", "success");
    } catch { addLog("Failed to copy.", "error"); }
  }

  async function copyCode() {
    if (!gameIdRef.current) return;
    try {
      await navigator.clipboard.writeText(gameIdRef.current.split("-")[1]);
      addLog("Code copied.", "success");
    } catch { addLog("Failed to copy.", "error"); }
  }

  // Whether we have a dormant session (disconnected but gameId preserved)
  const hasDormantSession = status === "idle" && gameId !== null;

  return (
    <div className="min-h-screen text-[#F0E6CC] overflow-x-hidden bg-[#0E1117]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Cinzel:wght@400;600;700;900&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,400&display=swap');
        .f-title  { font-family:'Cinzel Decorative',serif; }
        .f-cinzel { font-family:'Cinzel',serif; }
        .f-body   { font-family:'Crimson Pro',serif; }
        @keyframes floatY    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        @keyframes glowPulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes scanLine  { 0%{top:0%} 100%{top:100%} }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:none} }
        .float       { animation:floatY 6s ease-in-out infinite; }
        .glow-pulse  { animation:glowPulse 2.5s ease-in-out infinite; }
        .amber-glow  { text-shadow:0 0 40px rgba(200,134,26,.8),0 0 80px rgba(200,134,26,.3); }
        .card-glow   { box-shadow:0 0 0 1px rgba(200,134,26,.06),0 20px 60px rgba(0,0,0,.6); }
        .scan-line   { position:absolute; left:0; right:0; height:2px;
                       background:linear-gradient(to right,transparent,rgba(56,189,248,.4),transparent);
                       animation:scanLine 3s linear infinite; pointer-events:none; }
        .log-entry   { animation:fadeIn .25s ease both; }
      `}</style>

      {/* ════ NAV ════ */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0A0D14]/95 backdrop-blur-xl border-b border-[#C8861A]/20 py-3">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 group">
            <svg viewBox="0 0 40 40" className="w-9 h-9">
              <MiniHex x={20} y={20} size={18} fill="#C8861A" stroke="#F0C060" opacity={1} />
              <text x="20" y="24.5" textAnchor="middle" fill="#0E1117" fontSize="10" fontWeight="900" fontFamily="Cinzel Decorative,serif">H</text>
            </svg>
            <div>
              <div className="f-title text-[#C8861A] text-sm tracking-wider leading-none">HYBRID</div>
              <div className="f-cinzel text-[#F0E6CC]/50 text-[9px] tracking-[0.45em] uppercase leading-none">CATAN</div>
            </div>
          </a>
          <div className="flex items-center gap-3">
            <StatusPill status={status} />
          </div>
        </div>
      </nav>

      {/* ════ HERO ════ */}
      <div className="relative pt-28 pb-12 px-4 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ opacity: 0.035 }}>
          <svg viewBox="0 0 1200 400" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
            {Array.from({ length: 4 }, (_, r) =>
              Array.from({ length: 12 }, (_, c) => {
                const x = c * 110 + (r % 2 === 0 ? 0 : 55);
                const y = r * 95 + 50;
                return <MiniHex key={`${r}-${c}`} x={x} y={y} size={46} fill="#C8861A" stroke="#F0C060" opacity={1} />;
              })
            ).flat()}
          </svg>
        </div>
        <div className="relative max-w-6xl mx-auto text-center">
          <SectionLabel>Game Host Console</SectionLabel>
          <h1 className="f-title text-[clamp(2.5rem,6vw,5rem)] text-[#F0E6CC] leading-none">
            Camera<span className="text-[#C8861A] amber-glow"> Command</span>
          </h1>
          <p className="f-body text-[#6B7A99] text-lg mt-4 max-w-xl mx-auto">
            Connect your overhead camera, open a session, and let the CV engine take over.
          </p>
        </div>
      </div>

      {/* ════ MAIN GRID ════ */}
      <main className="max-w-6xl mx-auto px-4 pb-24 grid lg:grid-cols-[1fr_380px] gap-6">
        <video
          id="localVideo"
          autoPlay
          muted
          playsInline
          className="hidden"
        />
        {/* ── LEFT ── */}
        <div className="space-y-4">
          {/* Camera viewport */}
          <div className="relative rounded-xl border border-[#2A3347] overflow-hidden bg-[#060A10] card-glow" style={{ aspectRatio: "16/9" }}>
            {status === "live" && <div className="scan-line" />}
            {(["top-3 left-3", "top-3 right-3", "bottom-3 left-3", "bottom-3 right-3"] as const).map((pos, i) => (
              <div key={i} className={`absolute ${pos} w-5 h-5 pointer-events-none`}
                style={{
                  borderTop: i < 2 ? "2px solid rgba(200,134,26,.6)" : undefined,
                  borderBottom: i >= 2 ? "2px solid rgba(200,134,26,.6)" : undefined,
                  borderLeft: i % 2 === 0 ? "2px solid rgba(200,134,26,.6)" : undefined,
                  borderRight: i % 2 === 1 ? "2px solid rgba(200,134,26,.6)" : undefined,
                }} />
            ))}

            {status !== "live" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <div className="float">
                  <svg viewBox="0 0 80 80" className="w-20 h-20">
                    <MiniHex x={40} y={40} size={36} fill="rgba(200,134,26,.12)" stroke="rgba(200,134,26,.5)" opacity={1} />
                    <text x="40" y="47" textAnchor="middle" fill="#C8861A" fontSize="22">
                      {hasDormantSession ? "⏸" : status === "connecting" ? "⏳" : status === "error" ? "⚠️" : "📷"}
                    </text>
                  </svg>
                </div>
                <p className="f-cinzel text-sm text-[#4A5875] tracking-[0.3em] uppercase">
                  {hasDormantSession
                    ? "Session paused — camera off"
                    : status === "connecting" ? "Requesting camera…"
                      : status === "error" ? "Connection failed"
                        : "Camera not connected"}
                </p>
                {hasDormantSession && (
                  <p className="f-body text-xs text-[#C8861A]/60 tracking-wide">
                    Room code <span className="font-bold text-[#C8861A]">{gameId?.split("-")[1]}</span> is preserved — players are waiting
                  </p>
                )}
              </div>
            )}

            {/* Replace the <video> tag entirely */}
            <canvas
              ref={canvasRef}
              className={`w-full h-full object-cover transition-opacity duration-500 ${status === "live" ? "opacity-100" : "opacity-0"}`}
              style={{ background: "#000" }}
            />

            {/* Add CV status badge alongside existing LIVE badge */}
            {status === "live" && cvStatus !== "processing" && (
              <div className="absolute top-12 right-4 flex items-center gap-2 px-3 py-1.5 rounded border border-red-500/40 bg-[#0E1117]/80 backdrop-blur-sm z-20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                <span className="f-cinzel text-[10px] tracking-[0.35em] uppercase text-red-400">
                  {cvStatus === "no_board" ? "No Board Detected" : "CV Error"}
                </span>
              </div>
            )}

            {status === "live" && (
              <>
                <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded border border-red-500/40 bg-[#0E1117]/80 backdrop-blur-sm z-20">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  <span className="f-cinzel text-[10px] tracking-[0.35em] uppercase text-red-400">LIVE</span>
                </div>
                <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded border border-[#38BDF8]/30 bg-[#0E1117]/80 backdrop-blur-sm z-20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#38BDF8] glow-pulse" />
                  <span className="f-cinzel text-[10px] tracking-[0.35em] uppercase text-[#38BDF8]">CV Active</span>
                </div>
              </>
            )}

            <div className="absolute bottom-0 left-0 right-0 px-4 py-3 z-20 bg-gradient-to-t from-[#0E1117]/90 to-transparent flex items-center justify-between">
              <span className="f-cinzel text-[9px] tracking-[0.4em] uppercase text-[#2A3347]">
                {status === "live" ? "30 FPS · 1280×720" : "No signal"}
              </span>
              {gameId && <span className="f-cinzel text-[9px] tracking-[0.3em] uppercase text-[#C8861A]/70">{gameId}</span>}
            </div>
          </div>

          {/* ── Dormant session banner ── */}
          {hasDormantSession && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-lg border border-yellow-500/30 bg-yellow-500/05">
              <span className="text-yellow-400 text-lg flex-shrink-0 mt-0.5">⚠️</span>
              <div>
                <p className="f-cinzel text-[11px] text-yellow-400 tracking-widest uppercase mb-1">Session Inactive</p>
                <p className="f-body text-xs text-[#6B7A99] leading-relaxed">
                  The room is paused. Players who are connected will see a "Host disconnected" message and wait for you to rejoin.
                  Press <span className="text-[#C8861A] font-semibold">Rejoin Session</span> to restore the connection with the same room code.
                </p>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {status !== "live" ? (
              hasDormantSession ? (
                <>
                  <HexBtn primary onClick={rejoin} disabled={status === "connecting"}>
                    {status === "connecting" ? "⏳ Reconnecting…" : "🔄 Rejoin Session"}
                  </HexBtn>
                  <HexBtn onClick={() => { setGameId(null); addLog("Session cleared. Start a new one.", "warn"); }}>
                    ✕ New Session
                  </HexBtn>
                </>
              ) : (
                <HexBtn primary onClick={connect} disabled={status === "connecting"}>
                  {status === "connecting" ? "⏳ Connecting…" : "📷 Connect Camera"}
                </HexBtn>
              )
            ) : (
              <HexBtn onClick={disconnect}>⏹ Disconnect</HexBtn>
            )}
            {status === "live" && (
              <>
                <HexBtn primary>⚔️ Start Game</HexBtn>
                <HexBtn onClick={copyJoinLink}>🔗 Copy Join Link</HexBtn>
              </>
            )}
          </div>

          {status === "live" && (
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <InfoRow icon="🎮" label="Session ID" value={gameId ?? "—"} accent="amber" />
              <InfoRow icon="👥" label="Players Joined" value={`${players} / 4`} accent="cyan" />
              <InfoRow icon="📷" label="Frame Rate" value="30 FPS" accent="amber" />
              <InfoRow icon="⚡" label="Sync Latency" value="< 50ms" accent="cyan" />
            </div>
          )}

          {/* Setup guide */}
          <div className="rounded-xl border border-[#2A3347] bg-[#0E1117] overflow-hidden card-glow">
            <div className="px-5 py-3 border-b border-[#2A3347]">
              <span className="f-cinzel text-xs text-[#C8861A] tracking-[0.25em] uppercase">Setup Guide</span>
            </div>
            <div className="p-5 space-y-4">
              {[
                { num: "01", icon: "📷", title: "Mount your camera overhead", desc: "Position so the entire board is visible. 60–80 cm height works well." },
                { num: "02", icon: "🔗", title: "Press Connect Camera", desc: "Grants camera access and registers your room on the signaling server." },
                { num: "03", icon: "📱", title: "Share the access code or link", desc: "Players enter the 5-character code on their device — no app required." },
                { num: "04", icon: "⚔️", title: "Press Start Game", desc: "CV engine begins tracking pieces and the rule engine goes live." },
              ].map(({ num, icon, title, desc }) => (
                <div key={num} className="flex gap-4 items-start group">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center
                    border border-[#C8861A]/40 bg-[#C8861A]/08 text-[#C8861A] font-black text-xs
                    group-hover:border-[#C8861A] transition-all duration-300"
                    style={{ clipPath: "polygon(6px 0%,100% 0%,calc(100% - 6px) 100%,0% 100%)", fontFamily: "'Cinzel',serif" }}>
                    {num}
                  </div>
                  <div className="pt-0.5">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span>{icon}</span>
                      <h4 className="text-[#F0E6CC] font-bold text-sm tracking-wide f-cinzel">{title}</h4>
                    </div>
                    <p className="text-[#6B7A99] text-sm leading-relaxed f-body">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT ── */}
        <div className="space-y-4">
          {gameId && (
            <div className="rounded-xl border border-[#C8861A] bg-gradient-to-br from-[#C8861A]/10 to-[#0E1117] overflow-hidden card-glow p-5 text-center relative">
              <div className="absolute top-0 right-0 opacity-10 translate-x-1/4 -translate-y-1/4">
                <svg viewBox="0 0 100 100" className="w-24 h-24">
                  <MiniHex x={50} y={50} size={45} fill="#C8861A" stroke="#F0C060" />
                </svg>
              </div>
              <span className="f-cinzel text-[10px] text-[#C8861A] tracking-[0.4em] uppercase block mb-2">Player Access Code</span>
              <div className="flex items-center justify-center gap-3">
                <h2 className="f-title text-3xl tracking-widest text-[#F0E6CC] amber-glow uppercase">
                  {gameId.split("-")[1]}
                </h2>
                <button onClick={copyCode} className="p-2 hover:bg-[#C8861A]/20 rounded transition-colors" title="Copy Code">
                  <span className="text-xs">📋</span>
                </button>
              </div>
              <p className="f-body text-[11px] text-[#6B7A99] mt-2">
                Players enter this 5-character code. Full ID: <span className="text-[#C8861A]/70">{gameId}</span>
              </p>
              {hasDormantSession && (
                <div className="mt-3 px-3 py-1.5 rounded border border-yellow-500/30 bg-yellow-500/08 inline-flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
                  <span className="f-cinzel text-[9px] text-yellow-400 tracking-widest uppercase">Room Inactive</span>
                </div>
              )}
            </div>
          )}

          {/* Session status pipeline */}
          <div className="rounded-xl border border-[#C8861A]/20 bg-gradient-to-br from-[#C8861A]/05 to-[#0E1117] overflow-hidden card-glow">
            <div className="px-5 py-3 border-b border-[#C8861A]/15 flex items-center justify-between">
              <span className="f-cinzel text-xs text-[#C8861A] tracking-[0.25em] uppercase">Session Status</span>
              <StatusPill status={status} />
            </div>
            <div className="p-5 space-y-3">
              {[
                { icon: "📷", label: "Camera", active: status === "live" },
                { icon: "👁️", label: "CV Engine", active: status === "live" },
                { icon: "⚙️", label: "Game Server", active: status === "live" },
                { icon: "📡", label: "WebSocket", active: status === "live" },
                { icon: "📱", label: "Players", active: players > 0 },
              ].map(({ icon, label, active }, i) => (
                <div key={label}>
                  <div className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-all duration-500
                    ${active ? "border-[#C8861A]/40 bg-[#C8861A]/08" : "border-[#2A3347] bg-[#0A0F18]"}`}>
                    <span className="text-lg w-6 text-center">{icon}</span>
                    <span className={`f-cinzel text-xs tracking-wider flex-1 ${active ? "text-[#F0C060]" : "text-[#2A3347]"}`}>{label}</span>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-all duration-500 ${active ? "bg-emerald-500 animate-pulse" : "bg-[#1A2235]"}`} />
                  </div>
                  {i < 4 && (
                    <div className="flex pl-[2.1rem] py-0.5">
                      <div className={`w-px h-4 transition-all duration-500 ${active ? "bg-gradient-to-b from-[#C8861A]/50 to-[#38BDF8]/25" : "bg-[#1A2235]"}`} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Players list */}
          <div className="rounded-xl border border-[#38BDF8]/15 bg-[#0E1117] overflow-hidden card-glow">
            <div className="px-5 py-3 border-b border-[#38BDF8]/12 flex items-center justify-between">
              <span className="f-cinzel text-xs text-[#38BDF8] tracking-[0.25em] uppercase">Players</span>
              <span className="f-cinzel text-xs text-[#4A5875]">{players} / 4 joined</span>
            </div>
            <div className="p-4 space-y-2">
              {[
                { color: "bg-red-500", label: "Red", host: true },
                { color: "bg-blue-500", label: "Blue", host: false },
                { color: "bg-emerald-600", label: "Green", host: false },
                { color: "bg-orange-500", label: "Orange", host: false },
              ].map(({ color, label, host }, i) => {
                const joined = i === 0 ? status === "live" : i < players + (status === "live" ? 1 : 0);
                return (
                  <div key={label} className={`flex items-center gap-3 px-3 py-2 rounded border transition-all duration-300
                    ${joined ? "border-[#2A3347] bg-[#161C27]" : "border-[#161C27] bg-[#0A0F18] opacity-40"}`}>
                    <div className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-[10px] font-black text-white flex-shrink-0`}>
                      {label[0]}
                    </div>
                    <span className="f-cinzel text-xs tracking-wider text-[#6B7A99] flex-1">{label}</span>
                    {host && joined && <span className="f-cinzel text-[9px] text-[#C8861A] tracking-widest uppercase px-2 py-0.5 border border-[#C8861A]/30 rounded">Host</span>}
                    {joined && !host && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                    {!joined && <span className="f-cinzel text-[9px] text-[#2A3347] tracking-widest uppercase">Waiting</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Log */}
          <div className="rounded-xl border border-[#2A3347] bg-[#0E1117] overflow-hidden card-glow">
            <div className="px-5 py-3 border-b border-[#2A3347] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 glow-pulse" />
                <span className="f-cinzel text-xs text-[#38BDF8] tracking-[0.25em] uppercase">Connection Log</span>
              </div>
              <button onClick={() => setLogs([{ ts: now(), msg: "Log cleared.", type: "info" }])}
                className="f-cinzel text-[9px] text-[#2A3347] hover:text-[#4A5875] tracking-widest uppercase transition-colors">
                Clear
              </button>
            </div>
            <div className="p-3 h-64 overflow-y-auto space-y-1" style={{ scrollbarColor: "#2A3347 transparent" }}>
              {logs.map((entry, i) => (
                <div key={i} className={`log-entry flex gap-2 text-xs font-mono py-1 px-2 rounded ${i === 0 ? "bg-[#161C27]" : ""}`}>
                  <span className="text-[#2A3347] flex-shrink-0">{entry.ts}</span>
                  <span className={LOG_COLORS[entry.type]}>{entry.msg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Env hint */}
          <div className="px-4 py-3 rounded-lg border border-[#C8861A]/15 bg-[#C8861A]/04 flex gap-3">
            <span className="text-[#C8861A] text-sm flex-shrink-0">⚙️</span>
            <div>
              <p className="f-cinzel text-[10px] text-[#C8861A] tracking-widest uppercase mb-1">Environment</p>
              <p className="f-body text-xs text-[#4A5875] leading-relaxed">
                Set <code className="text-[#F0C060] bg-[#0A0F18] px-1 rounded">NEXT_PUBLIC_HOST_WS</code> in{" "}
                <code className="text-[#7DD3FC] bg-[#0A0F18] px-1 rounded">.env.local</code> to your signaling server URL.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* ════ FOOTER ════ */}
      <footer className="border-t border-[#C8861A]/10 py-8 px-6 bg-[#060810]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="w-8 h-8">
              <MiniHex x={20} y={20} size={18} fill="#C8861A" stroke="#F0C060" opacity={1} />
              <text x="20" y="24.5" textAnchor="middle" fill="#0E1117" fontSize="10" fontWeight="900" fontFamily="Cinzel Decorative,serif">H</text>
            </svg>
            <div className="f-title text-[#C8861A] text-sm tracking-wider">HYBRID CATAN</div>
          </div>
          <p className="f-cinzel text-[10px] text-[#2A3347] tracking-[0.2em] uppercase">
            Host Console · WebRTC · Socket.IO · OpenCV
          </p>
          <div className="flex gap-5">
            {["Docs", "GitHub", "Discord"].map(l => (
              <a key={l} href="#" className="f-cinzel text-[10px] tracking-[0.25em] uppercase text-[#2A3347] hover:text-[#C8861A] transition-colors duration-300">{l}</a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}