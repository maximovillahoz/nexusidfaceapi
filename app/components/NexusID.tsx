"use client";

import { useState, useEffect, useRef } from "react";
import * as faceapi from "face-api.js";

// ── Palette ───────────────────────────────────────────────────────────────────
const M = {
    green: "#00ff41", greenBright: "#39ff6e", greenDim: "#00c832",
    greenFaint: "rgba(0,255,65,0.10)", greenBorder: "rgba(0,255,65,0.30)",
    greenDark: "#007020", greenDarkMid: "#005a18",
    error: "#cc0000", errorLight: "#ff2d2d", errorFaint: "rgba(204,0,0,0.10)",
    warn: "#7a8c00", warnDark: "#b8ff00",
    dark: {
        bg: "#000000", card: "rgba(0,10,0,0.84)", border: "rgba(0,255,65,0.15)",
        text: "#00ff41", muted: "rgba(0,255,65,0.32)", subtext: "rgba(0,255,65,0.50)"
    },
    light: {
        bg: "#ffffff", card: "rgba(255,255,255,0.96)", border: "rgba(0,0,0,0.10)",
        text: "#0a0a0a", muted: "#555555", subtext: "#888888"
    },
};

// ── Types ─────────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
type Mode = "login" | "register";
type StatusKey = "idle" | "loading_models" | "camera_permission" | "camera_active" | "scanning" | "face_detected" | "verified" | "failed";
type Attempt = { success: boolean; conf: number };

// ── Color helpers ─────────────────────────────────────────────────────────────
function accentColor(s: StatusKey, t: Theme) {
    if (t === "dark") {
        if (s === "loading_models") return M.warnDark;
        if (s === "failed") return M.errorLight;
        if (s === "face_detected") return M.greenBright;
        return M.green;
    }
    if (s === "loading_models") return M.warn;
    if (s === "failed") return M.error;
    if (s === "face_detected") return M.greenDarkMid;
    return M.greenDark;
}
function neonColor(s: StatusKey) {
    if (s === "loading_models") return M.warnDark;
    if (s === "failed") return M.errorLight;
    if (s === "face_detected") return M.greenBright;
    return M.green;
}

const STATUS_META: Record<StatusKey, { label: string; sub: string; badge: string; icon: string; pulse: boolean }> = {
    idle: { label: "SISTEMA EN ESPERA", sub: "Activa la cámara para comenzar", badge: "STANDBY", icon: "◎", pulse: false },
    loading_models: { label: "CARGANDO MODELOS", sub: "Inicializando motores neuronales...", badge: "INIT", icon: "⟳", pulse: true },
    camera_permission: { label: "SOLICITANDO ACCESO", sub: "Permite el acceso a tu cámara", badge: "PERMS", icon: "◈", pulse: false },
    camera_active: { label: "CÁMARA ACTIVA", sub: "Sistema listo. Selecciona modo", badge: "READY", icon: "●", pulse: false },
    scanning: { label: "ESCANEANDO BIOMETRÍA", sub: "Mantén tu rostro centrado y quieto", badge: "SCAN", icon: "◉", pulse: true },
    face_detected: { label: "ROSTRO DETECTADO", sub: "Analizando patrones faciales...", badge: "MATCH", icon: "◈", pulse: true },
    verified: { label: "IDENTIDAD VERIFICADA", sub: "Acceso concedido. Bienvenido.", badge: "VERIFIED", icon: "✓", pulse: false },
    failed: { label: "IDENTIDAD NO RECONOCIDA", sub: "Sin coincidencia en base de datos.", badge: "DENIED", icon: "✕", pulse: false },
};

const safeGet = (k: string) => { if (typeof window === "undefined") return null; try { return localStorage.getItem(k); } catch { return null; } };
function euclideanDistance(a: number[], b: number[]) { return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0)); }

// ── MatrixRain ────────────────────────────────────────────────────────────────
function MatrixRain({ active, theme }: { active: boolean; theme: Theme }) {
    const ref = useRef<HTMLCanvasElement>(null);
    const raf = useRef<number>(0);
    const themeRef = useRef(theme);
    useEffect(() => { themeRef.current = theme; }, [theme]);
    useEffect(() => {
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize(); window.addEventListener("resize", resize);
        const CHARS = "アイウエオカキクケコ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ∆∑∏∈∀∃≡≠";
        const FS = 13;
        let drops = Array.from({ length: Math.floor(canvas.width / FS) }, () => Math.random() * -80);
        const draw = () => {
            const isDark = themeRef.current === "dark";
            const cols = Math.floor(canvas.width / FS);
            if (drops.length !== cols) drops = Array.from({ length: cols }, () => Math.random() * -50);
            ctx.fillStyle = isDark ? "rgba(0,0,0,0.046)" : "rgba(255,255,255,0.055)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.font = `${FS}px monospace`;
            for (let i = 0; i < cols; i++) {
                const char = CHARS[Math.floor(Math.random() * CHARS.length)];
                const y = drops[i] * FS;
                if (isDark) { const a = 0.08 + Math.random() * 0.85; ctx.fillStyle = `rgba(0,255,65,${a})`; }
                else { const a = 0.55 + Math.random() * 0.45; ctx.fillStyle = `rgba(0,0,0,${a})`; }
                ctx.fillText(char, i * FS, y);
                if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
                drops[i] += 0.48;
            }
            raf.current = requestAnimationFrame(draw);
        };
        draw();
        return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize); };
    }, []);
    const opacity = theme === "dark" ? (active ? 0.62 : 0.20) : (active ? 0.30 : 0.10);
    return <canvas ref={ref} style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 0, opacity, transition: "opacity 1.4s ease", pointerEvents: "none" }} />;
}

// ── DotGrid ───────────────────────────────────────────────────────────────────
function DotGrid({ scanning, faceDetected }: { scanning: boolean; faceDetected: boolean; theme: Theme }) {
    const cols = 18, rows = 14;
    return (
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gridTemplateRows: `repeat(${rows},1fr)`, padding: 12, pointerEvents: "none" }}>
            {Array.from({ length: cols * rows }).map((_, i) => {
                const cx = (i % cols) / (cols - 1), cy = Math.floor(i / cols) / (rows - 1);
                const dist = Math.sqrt((cx - 0.5) ** 2 + (cy - 0.5) ** 2);
                const inFace = dist < 0.32, near = dist < 0.42;
                const rnd = Math.sin(i * 137.508) * 0.5 + 0.5;
                let opacity = 0.12, color = "rgba(0,255,65,0.14)", size = 2;
                if (scanning && near) { opacity = 0.4 + rnd * 0.6; color = M.green; size = inFace ? 3 : 2; }
                if (faceDetected && inFace) { opacity = 0.75 + rnd * 0.25; color = M.greenBright; size = 3; }
                return (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ width: size, height: size, borderRadius: "50%", background: color, opacity, transition: `opacity 0.3s ${rnd * 1.1}s`, animation: scanning && inFace ? `dotPulse 1.1s ease-in-out ${rnd * 1.4}s infinite` : "none" }} />
                    </div>
                );
            })}
        </div>
    );
}

// ── HUDCorners ────────────────────────────────────────────────────────────────
function HUDCorners({ status }: { status: StatusKey }) {
    const color = neonColor(status);
    return (<>{[{ top: 0, left: 0, borderTop: `2px solid ${color}`, borderLeft: `2px solid ${color}` }, { top: 0, right: 0, borderTop: `2px solid ${color}`, borderRight: `2px solid ${color}` }, { bottom: 0, left: 0, borderBottom: `2px solid ${color}`, borderLeft: `2px solid ${color}` }, { bottom: 0, right: 0, borderBottom: `2px solid ${color}`, borderRight: `2px solid ${color}` }].map((s, i) => (
        <div key={i} style={{ position: "absolute", width: 30, height: 30, ...s, filter: `drop-shadow(0 0 5px ${color})`, transition: "border-color 0.4s ease" }} />
    ))}</>);
}

// ── FaceFrame ─────────────────────────────────────────────────────────────────
function FaceFrame({ status }: { status: StatusKey }) {
    if (!["scanning", "face_detected", "verified", "failed"].includes(status)) return null;
    const color = status === "failed" ? M.errorLight : status === "face_detected" ? M.greenBright : M.green;
    return (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-54%)", width: 162, height: 202, border: `2px solid ${color}`, borderRadius: "50%", filter: `drop-shadow(0 0 10px ${color})`, animation: status === "scanning" ? "framePulse 2s ease-in-out infinite" : "none", transition: "border-color 0.5s", pointerEvents: "none" }}>
            {status === "scanning" && <div style={{ position: "absolute", left: 4, right: 4, height: 2, background: `linear-gradient(90deg,transparent,${color},transparent)`, animation: "scanLine 1.7s ease-in-out infinite" }} />}
        </div>
    );
}

// ── ProgressBar ───────────────────────────────────────────────────────────────
function ProgressBar({ value, color, bgColor }: { value: number; color: string; bgColor?: string }) {
    return (
        <div style={{ height: 3, background: bgColor || "rgba(0,0,0,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${value}%`, borderRadius: 2, background: `linear-gradient(90deg,${color}88,${color})`, boxShadow: `0 0 6px ${color}`, transition: "width 1.2s cubic-bezier(0.4,0,0.2,1)" }} />
        </div>
    );
}

// ── AttemptHistory ────────────────────────────────────────────────────────────
function AttemptHistory({ attempts, theme }: { attempts: Attempt[]; theme: Theme }) {
    const c = theme === "dark" ? M.dark : M.light;
    if (!attempts.length) return null;
    const sc = theme === "dark" ? M.green : M.greenDark, fc = theme === "dark" ? M.errorLight : M.error;
    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, letterSpacing: 2, color: c.muted, marginBottom: 6 }}>HISTORIAL</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {attempts.map((a, i) => (
                    <div key={i} style={{ width: 28, height: 28, borderRadius: 4, border: `1px solid ${a.success ? sc : fc}`, background: a.success ? (theme === "dark" ? "rgba(0,255,65,0.10)" : "rgba(0,112,32,0.10)") : (theme === "dark" ? "rgba(255,45,45,0.12)" : "rgba(204,0,0,0.08)"), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: a.success ? sc : fc, fontFamily: "monospace" }}>
                        {a.success ? "✓" : "✕"}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── ModelLoadingOverlay ───────────────────────────────────────────────────────
function ModelLoadingOverlay() {
    const [progress, setProgress] = useState(0);
    const [step, setStep] = useState(0);
    const steps = ["tiny_face_detector", "face_landmark_68", "face_recognition"];
    useEffect(() => {
        const i1 = setInterval(() => setProgress(p => p >= 100 ? (clearInterval(i1), 100) : p + 2), 40);
        const i2 = setInterval(() => setStep(s => Math.min(s + 1, steps.length - 1)), 700);
        return () => { clearInterval(i1); clearInterval(i2); };
    }, []);
    return (
        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.93)", backdropFilter: "blur(6px)", gap: 16 }}>
            <div style={{ position: "relative", width: 84, height: 84 }}>
                {[0, 10, 20].map((ins, i) => (
                    <div key={i} style={{ position: "absolute", inset: ins, border: `${i === 2 ? 2 : 1}px solid ${i === 2 ? M.green : M.greenBorder}`, borderRadius: "50%", ...(i === 2 ? { borderTopColor: "transparent", animation: "spin 0.9s linear infinite" } : {}) }} />
                ))}
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: M.green }}>⬡</div>
            </div>
            <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, letterSpacing: 3, color: M.green, marginBottom: 4 }}>CARGANDO MODELOS NEURONALES</div>
                <div style={{ fontSize: 10, color: M.greenDim, fontFamily: "monospace" }}>{steps[step]}...</div>
            </div>
            <div style={{ width: 200 }}>
                <ProgressBar value={progress} color={M.green} bgColor="rgba(0,255,65,0.12)" />
                <div style={{ textAlign: "right", fontSize: 10, color: M.green, marginTop: 4, fontFamily: "monospace" }}>{progress}%</div>
            </div>
        </div>
    );
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
function StatusBadge({ status, theme }: { status: StatusKey; theme: Theme }) {
    const meta = STATUS_META[status], neon = neonColor(status);
    const pillBg = theme === "dark" ? `${neon}12` : "#0d0d0d";
    const pillBorder = theme === "dark" ? `${neon}44` : `${neon}88`;
    return (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: pillBg, border: `1px solid ${pillBorder}`, borderRadius: 4, fontSize: 10, letterSpacing: 2, color: neon, fontFamily: "monospace", textShadow: `0 0 6px ${neon}88` }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: neon, boxShadow: `0 0 8px ${neon}`, animation: meta.pulse ? "blink 1s ease-in-out infinite" : "none" }} />
            {meta.badge}
        </div>
    );
}

// ── ResultScreen ──────────────────────────────────────────────────────────────
function ResultScreen({ status, confidence, photo, attempts, onRetry, onReset, theme }: { status: StatusKey; confidence: number; photo: string | null; attempts: Attempt[]; onRetry: () => void; onReset: () => void; theme: Theme }) {
    const c = theme === "dark" ? M.dark : M.light;
    const success = status === "verified";
    const accent = success ? accentColor(status, theme) : (theme === "dark" ? M.errorLight : M.error);
    const accentNeon = success ? M.green : M.errorLight;
    const [animIn, setAnimIn] = useState(false);
    useEffect(() => { const t = setTimeout(() => setAnimIn(true), 60); return () => clearTimeout(t); }, []);
    const iconBg = theme === "dark" ? (success ? "rgba(0,255,65,0.10)" : "rgba(255,45,45,0.12)") : "#0d0d0d";
    return (
        <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Share Tech Mono','Space Mono','Courier New',monospace" }}>
            {/* Icon / Photo */}
            <div style={{ width: 144, height: 144, borderRadius: "50%", border: `2px solid ${theme === "dark" ? accent : accentNeon}`, background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: `0 0 40px ${theme === "dark" ? accent : accentNeon}55`, marginBottom: photo ? 8 : 32, transform: animIn ? "scale(1)" : "scale(0.5)", opacity: animIn ? 1 : 0, transition: "transform 0.6s cubic-bezier(0.175,0.885,0.32,1.275), opacity 0.4s ease" }}>
                {photo ? <img src={photo} alt="Foto registrada" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ fontSize: 58, color: theme === "dark" ? accent : accentNeon, textShadow: `0 0 20px ${theme === "dark" ? accent : accentNeon}` }}>{success ? "✓" : "✕"}</div>}
            </div>
            {photo && <div style={{ marginBottom: 24, width: 36, height: 36, borderRadius: "50%", background: accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#000", fontWeight: 700, boxShadow: `0 0 12px ${accent}` }}>{success ? "✓" : "✕"}</div>}

            {/* Verdict */}
            <div style={{ textAlign: "center", marginBottom: 28, transform: animIn ? "translateY(0)" : "translateY(22px)", opacity: animIn ? 1 : 0, transition: "transform 0.5s ease 0.2s, opacity 0.5s ease 0.2s" }}>
                <div style={{ display: "inline-block", fontSize: 11, letterSpacing: 4, color: theme === "dark" ? accent : accentNeon, marginBottom: 12, padding: theme === "light" ? "3px 12px" : "0", background: theme === "light" ? "#0d0d0d" : "transparent", borderRadius: theme === "light" ? 4 : 0, textShadow: `0 0 12px ${theme === "dark" ? accent : accentNeon}` }}>
                    {success ? "ACCESO CONCEDIDO" : "ACCESO DENEGADO"}
                </div>
                <div style={{ fontSize: 25, fontWeight: 700, color: c.text, marginBottom: 12, letterSpacing: 1 }}>{success ? "Identidad Verificada" : "No Reconocido"}</div>
                <div style={{ fontSize: 13, color: c.muted, maxWidth: 320, lineHeight: 1.65 }}>{success ? "Tu identidad biométrica ha sido confirmada exitosamente con alta confianza." : "No encontramos coincidencia. Regístrate primero o intenta de nuevo."}</div>
            </div>

            {/* Confidence card */}
            <div style={{ width: "100%", maxWidth: 340, background: c.card, border: `1px solid ${theme === "dark" ? `${accent}44` : c.border}`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, backdropFilter: "blur(14px)", transform: animIn ? "translateY(0)" : "translateY(22px)", opacity: animIn ? 1 : 0, transition: "transform 0.5s ease 0.35s, opacity 0.5s ease 0.35s" }}>
                <div style={{ fontSize: 10, letterSpacing: 2, color: c.muted, marginBottom: 10 }}>CONFIANZA BIOMÉTRICA</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: c.text }}>Coincidencia facial</span>
                    <span style={{ fontSize: 13, fontFamily: "monospace", color: theme === "dark" ? accent : accentNeon, background: theme === "light" ? "#0d0d0d" : "transparent", padding: theme === "light" ? "1px 7px" : "0", borderRadius: 3, textShadow: `0 0 8px ${theme === "dark" ? accent : accentNeon}` }}>{confidence}%</span>
                </div>
                <ProgressBar value={confidence} color={accent} bgColor={theme === "dark" ? "rgba(0,255,65,0.10)" : "rgba(0,0,0,0.10)"} />
                <AttemptHistory attempts={attempts} theme={theme} />
            </div>

            {/* Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%", maxWidth: 340, transform: animIn ? "translateY(0)" : "translateY(22px)", opacity: animIn ? 1 : 0, transition: "transform 0.5s ease 0.5s, opacity 0.5s ease 0.5s" }}>
                <button onClick={onRetry} style={{ padding: "14px 24px", background: theme === "dark" ? `${M.green}18` : "#0d0d0d", border: `1px solid ${M.green}`, borderRadius: 8, color: M.green, fontSize: 12, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit", textShadow: `0 0 8px ${M.green}88` }}
                    onMouseOver={e => { e.currentTarget.style.background = theme === "dark" ? `${M.green}30` : "#1a1a1a"; }}
                    onMouseOut={e => { e.currentTarget.style.background = theme === "dark" ? `${M.green}18` : "#0d0d0d"; }}>
                    ↻ REINTENTAR IDENTIFICACIÓN
                </button>
                <button onClick={onReset} style={{ padding: "12px 24px", background: "transparent", border: `1px solid ${theme === "dark" ? M.greenBorder : c.border}`, borderRadius: 8, color: theme === "dark" ? M.greenDim : c.muted, fontSize: 11, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit" }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = theme === "dark" ? M.green : "#111"; e.currentTarget.style.color = theme === "dark" ? M.green : "#111"; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = theme === "dark" ? M.greenBorder : c.border; e.currentTarget.style.color = theme === "dark" ? M.greenDim : c.muted; }}>
                    ⬡ CAMBIAR USUARIO
                </button>
            </div>
        </div>
    );
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
export default function NexusID() {
    const [theme, setTheme] = useState<Theme>("dark");
    const [status, setStatus] = useState<StatusKey>("idle");
    const [view, setView] = useState<"identify" | "result">("identify");
    const [confidence, setConfidence] = useState(0);
    const [attempts, setAttempts] = useState<Attempt[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [registeredPhoto, setRegisteredPhoto] = useState<string | null>(() => safeGet("face_photo_demo"));
    const [modelsLoaded, setModelsLoaded] = useState(false);
    const [cameraActive, setCameraActive] = useState(false);
    const [hasRegistered, setHasRegistered] = useState(false);
    const [mode, setMode] = useState<Mode>("login");
    const [matrixActive, setMatrixActive] = useState(false);

    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const c = theme === "dark" ? M.dark : M.light;
    const isScanning = status === "scanning";
    const isFaceDetected = status === "face_detected";
    const isResult = status === "verified" || status === "failed";
    const bodyAccent = accentColor(status, theme);
    const meta = STATUS_META[status];

    useEffect(() => { setHasRegistered(!!localStorage.getItem("face_descriptor_demo")); }, []);
    useEffect(() => { return () => stopCamera(); }, []);

    // ── Real face-api.js functions ─────────────────────────────────────────────
    async function loadModels() {
        try {
            setStatus("loading_models"); setErrorMsg(null);
            await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
            await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
            await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
            setModelsLoaded(true); return true;
        } catch {
            setErrorMsg("No se pudieron cargar los modelos. Verifica /public/models.");
            setStatus("idle"); return false;
        }
    }

    async function startCamera() {
        if (!modelsLoaded) { const ok = await loadModels(); if (!ok) return; }
        try {
            setStatus("camera_permission"); setErrorMsg(null);
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            streamRef.current = stream;
            if (!videoRef.current) return;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setCameraActive(true); setStatus("camera_active");
        } catch {
            setErrorMsg("No se pudo acceder a la cámara. Revisa los permisos del navegador.");
            setStatus("idle");
        }
    }

    function stopCamera() {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        setCameraActive(false);
    }

    function captureFrame() {
        const video = videoRef.current, canvas = canvasRef.current;
        if (!video || !canvas) return false;
        if (!video.videoWidth || !video.videoHeight) { setErrorMsg("La cámara aún no está lista."); return false; }
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d"); if (!ctx) return false;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return true;
    }

    async function handleRegister() {
        if (status !== "camera_active") return;
        setStatus("scanning"); setMatrixActive(true); setErrorMsg(null);
        await new Promise(r => setTimeout(r, 400));
        if (!captureFrame()) { setStatus("camera_active"); setMatrixActive(false); return; }
        setStatus("face_detected");
        const canvas = canvasRef.current!;
        const detection = await faceapi
            .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
            setErrorMsg("No se detectó ninguna cara. Intenta con más luz.");
            setStatus("camera_active"); setMatrixActive(false); return;
        }
        localStorage.setItem("face_descriptor_demo", JSON.stringify(Array.from(detection.descriptor)));
        // Crop and save photo
        const { x, y, width, height } = detection.detection.box;
        const size = Math.max(width, height) * 1.4;
        const cx = x + width / 2, cy = y + height / 2;
        const photoCanvas = document.createElement("canvas");
        photoCanvas.width = photoCanvas.height = 200;
        const pCtx = photoCanvas.getContext("2d")!;
        pCtx.drawImage(canvas, cx - size / 2, cy - size / 2, size, size, 0, 0, 200, 200);
        const photoUrl = photoCanvas.toDataURL("image/jpeg", 0.85);
        localStorage.setItem("face_photo_demo", photoUrl);
        setRegisteredPhoto(photoUrl); setHasRegistered(true);
        setStatus("camera_active"); setMatrixActive(false); setErrorMsg(null);
        alert("✓ Registro exitoso. Tu cara ha sido guardada. Ahora puedes identificarte.");
    }

    async function handleIdentify() {
        if (status !== "camera_active") return;
        const stored = localStorage.getItem("face_descriptor_demo");
        if (!stored) { setErrorMsg("No hay cara registrada. Regístrate primero."); return; }
        setStatus("scanning"); setMatrixActive(true); setErrorMsg(null);
        await new Promise(r => setTimeout(r, 400));
        if (!captureFrame()) { setStatus("camera_active"); setMatrixActive(false); return; }
        setStatus("face_detected");
        await new Promise(r => setTimeout(r, 800));
        const canvas = canvasRef.current!;
        const detection = await faceapi
            .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks().withFaceDescriptor();
        if (!detection) {
            setErrorMsg("No se detectó ninguna cara.");
            setStatus("camera_active"); setMatrixActive(false); return;
        }
        const dist = euclideanDistance(JSON.parse(stored) as number[], Array.from(detection.descriptor));
        const THRESHOLD = 0.55;
        const success = dist < THRESHOLD;
        const conf = Math.min(success ? Math.round((1 - dist / THRESHOLD) * 100) : Math.round(dist * 30), 99);
        setConfidence(conf);
        setAttempts(p => [...p, { success, conf }]);
        setStatus(success ? "verified" : "failed");
        setMatrixActive(false);
        setTimeout(() => { stopCamera(); setView("result"); }, 900);
    }

    function handleRetry() {
        setView("identify"); setStatus("camera_active");
        setCameraActive(false); setMatrixActive(false);
    }
    function handleReset() {
        setView("identify"); setStatus("idle");
        stopCamera(); setConfidence(0); setAttempts([]); setMatrixActive(false);
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: "100vh", background: theme === "dark" ? "#000000" : "#ffffff",
            fontFamily: "'Share Tech Mono','Space Mono','Courier New',monospace",
            position: "relative", overflow: "hidden", transition: "background 0.4s ease"
        }}>
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@700;900&display=swap');
        * { box-sizing:border-box; }
        ::selection { background:#00ff4133; color:#00ff41; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-thumb { background:rgba(0,255,65,0.3); border-radius:2px; }
        @keyframes spin       { to { transform:rotate(360deg); } }
        @keyframes blink      { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes scanLine   { 0%{top:8px;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:calc(100% - 8px);opacity:0} }
        @keyframes framePulse { 0%,100%{box-shadow:0 0 10px #00ff41} 50%{box-shadow:0 0 26px #00ff41,0 0 50px #00ff4144} }
        @keyframes dotPulse   { 0%,100%{transform:scale(1);opacity:.55} 50%{transform:scale(1.9);opacity:1} }
        @keyframes floatIn    { from{transform:translateY(14px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes glitch     { 0%,89%,100%{clip-path:none;transform:none} 90%{clip-path:inset(18% 0 62% 0);transform:translate(-2px,0)} 92%{clip-path:inset(52% 0 18% 0);transform:translate(2px,0)} 94%{clip-path:none;transform:none} }
        button:focus-visible  { outline:1px solid #00ff41; outline-offset:2px; }
        video { width:100%; height:100%; object-fit:cover; display:block; }
      `}</style>

            <MatrixRain active={matrixActive} theme={theme} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Vignette */}
            <div style={{
                position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
                background: theme === "dark"
                    ? "radial-gradient(ellipse at 50% 40%, rgba(0,255,65,0.03) 0%, transparent 65%)"
                    : "radial-gradient(ellipse at 50% 40%, rgba(0,80,20,0.02) 0%, transparent 65%)"
            }} />

            {view === "result" ? (
                <ResultScreen status={status} confidence={confidence} photo={registeredPhoto}
                    attempts={attempts} onRetry={handleRetry} onReset={handleReset} theme={theme} />
            ) : (
                <div style={{
                    position: "relative", zIndex: 1, maxWidth: 490, margin: "0 auto",
                    padding: "24px 16px", display: "flex", flexDirection: "column", minHeight: "100vh"
                }}>

                    {/* ── Header ── */}
                    <div style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        marginBottom: 26, animation: "floatIn 0.5s ease both"
                    }}>
                        <div>
                            <div style={{
                                display: "inline-block", fontSize: 22, fontWeight: 900,
                                fontFamily: "'Orbitron',monospace", color: M.green, letterSpacing: 4,
                                textShadow: `0 0 14px ${M.green}, 0 0 30px ${M.green}55`,
                                animation: "glitch 10s ease-in-out infinite",
                                ...(theme === "light" ? { background: "#0d0d0d", padding: "4px 14px", borderRadius: 6, border: `1px solid ${M.greenBorder}` } : {})
                            }}>
                                NEXUS ID
                            </div>
                            <div style={{
                                fontSize: 9, letterSpacing: 3, marginTop: 4,
                                color: theme === "dark" ? M.greenDim : c.muted
                            }}>
                                IDENTIFICACIÓN BIOMÉTRICA v2.4
                            </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <StatusBadge status={status} theme={theme} />
                            <button onClick={() => setTheme(t => t === "dark" ? "light" : "dark")} title="Cambiar tema"
                                style={{
                                    width: 36, height: 36, borderRadius: 6,
                                    background: theme === "dark" ? "rgba(0,255,65,0.06)" : "#f0f0f0",
                                    border: `1px solid ${theme === "dark" ? M.greenBorder : c.border}`,
                                    color: theme === "dark" ? M.greenDim : c.muted,
                                    fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center",
                                    justifyContent: "center", transition: "all 0.2s"
                                }}
                                onMouseOver={e => { e.currentTarget.style.background = theme === "dark" ? M.greenFaint : "#e0e0e0"; e.currentTarget.style.color = theme === "dark" ? M.green : "#111"; }}
                                onMouseOut={e => { e.currentTarget.style.background = theme === "dark" ? "rgba(0,255,65,0.06)" : "#f0f0f0"; e.currentTarget.style.color = theme === "dark" ? M.greenDim : c.muted; }}>
                                {theme === "dark" ? "☀" : "☾"}
                            </button>
                        </div>
                    </div>

                    {/* ── Camera Card ── */}
                    <div style={{
                        position: "relative", background: "rgba(0,8,0,0.9)",
                        border: `1px solid ${theme === "dark" ? M.greenBorder : "rgba(0,80,20,0.35)"}`,
                        borderRadius: 14, overflow: "hidden", marginBottom: 14, aspectRatio: "4/3",
                        boxShadow: theme === "dark" ? `0 0 30px ${M.green}14, inset 0 0 30px rgba(0,0,0,0.5)` : "0 2px 20px rgba(0,0,0,0.15)",
                        animation: "floatIn 0.5s ease 0.1s both"
                    }}>

                        {/* Real video feed */}
                        <video ref={videoRef} playsInline muted style={{
                            position: "absolute", inset: 0,
                            width: "100%", height: "100%", objectFit: "cover", display: cameraActive ? "block" : "none"
                        }} />

                        {/* Placeholder */}
                        {!cameraActive && (
                            <div style={{
                                position: "absolute", inset: 0,
                                background: "radial-gradient(ellipse at center, #001800 0%, #000500 100%)",
                                display: "flex", alignItems: "center", justifyContent: "center"
                            }}>
                                {status === "camera_permission" ? (
                                    <div style={{ textAlign: "center", padding: 24 }}>
                                        <div style={{ fontSize: 34, marginBottom: 12, color: M.green, textShadow: `0 0 16px ${M.green}` }}>◈</div>
                                        <div style={{ fontSize: 12, letterSpacing: 1, color: M.green, marginBottom: 8 }}>Permiso requerido</div>
                                        <div style={{ fontSize: 11, color: M.greenDim, lineHeight: 1.6 }}>Tu navegador solicitará acceso a la cámara.</div>
                                    </div>
                                ) : status === "loading_models" ? null : (
                                    <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 46, color: M.greenDim, marginBottom: 8, opacity: 0.35 }}>◎</div>
                                        <div style={{ fontSize: 11, letterSpacing: 2, color: M.greenDim }}>CÁMARA INACTIVA</div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* HUD overlays */}
                        {cameraActive && <DotGrid scanning={isScanning} faceDetected={isFaceDetected} theme="dark" />}
                        <FaceFrame status={status} />
                        {cameraActive && <HUDCorners status={status} />}
                        {status === "loading_models" && <ModelLoadingOverlay />}

                        {cameraActive && (
                            <>
                                <div style={{
                                    position: "absolute", top: 10, left: 10, fontSize: 9, letterSpacing: 1,
                                    color: M.green, fontFamily: "monospace", lineHeight: 1.85, opacity: 0.6,
                                    textShadow: `0 0 4px ${M.green}`
                                }}>
                                    <div>SYS v2.4.1</div><div>BIOMETRIC</div><div>LIVE</div>
                                </div>
                                <div style={{
                                    position: "absolute", top: 10, right: 10, fontSize: 9, letterSpacing: 1,
                                    color: isScanning ? M.greenBright : M.greenDim, fontFamily: "monospace",
                                    textAlign: "right", lineHeight: 1.85, opacity: 0.65
                                }}>
                                    <div>REC ●</div><div>NEURAL</div><div>ACTIVE</div>
                                </div>
                            </>
                        )}

                        {/* Result flash */}
                        {isResult && cameraActive && (
                            <div style={{
                                position: "absolute", inset: 0,
                                background: status === "verified" ? "rgba(0,255,65,0.08)" : "rgba(255,45,45,0.10)",
                                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 68,
                                color: status === "verified" ? M.green : M.errorLight,
                                textShadow: `0 0 30px ${status === "verified" ? M.green : M.errorLight}`
                            }}>
                                {status === "verified" ? "✓" : "✕"}
                            </div>
                        )}
                    </div>

                    {/* ── Status Panel ── */}
                    <div style={{
                        background: theme === "dark" ? "rgba(0,8,0,0.78)" : c.card,
                        border: `1px solid ${theme === "dark" ? (status === "failed" ? `${M.errorLight}44` : M.greenBorder) : (status === "failed" ? `${M.error}33` : c.border)}`,
                        borderRadius: 10, padding: "13px 15px", marginBottom: 14,
                        backdropFilter: "blur(10px)", animation: "floatIn 0.5s ease 0.2s both"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                                fontSize: 20, minWidth: 34, height: 34, display: "flex",
                                alignItems: "center", justifyContent: "center",
                                ...(theme === "light" ? { background: "#0d0d0d", borderRadius: 6, border: `1px solid ${neonColor(status)}44` } : {}),
                                color: theme === "dark" ? bodyAccent : neonColor(status),
                                textShadow: `0 0 10px ${neonColor(status)}`,
                                animation: meta.pulse ? "blink 1.3s ease-in-out infinite" : "none"
                            }}>
                                {meta.icon}
                            </div>
                            <div>
                                <div style={{
                                    fontSize: 11, fontWeight: 700, letterSpacing: 1, color: bodyAccent,
                                    textShadow: theme === "dark" ? `0 0 8px ${bodyAccent}88` : "none"
                                }}>
                                    {meta.label}
                                </div>
                                <div style={{ fontSize: 10, color: c.muted, marginTop: 2 }}>{meta.sub}</div>
                            </div>
                        </div>
                        {(isScanning || isFaceDetected) && (
                            <div style={{ marginTop: 11 }}>
                                <ProgressBar
                                    value={isFaceDetected ? 76 : 44}
                                    color={isFaceDetected ? (theme === "dark" ? M.greenBright : M.greenDark) : (theme === "dark" ? M.green : M.greenDark)}
                                    bgColor={theme === "dark" ? "rgba(0,255,65,0.10)" : "rgba(0,0,0,0.08)"} />
                            </div>
                        )}
                        {errorMsg && (
                            <div style={{
                                marginTop: 10, fontSize: 10,
                                color: theme === "dark" ? M.errorLight : M.error,
                                background: theme === "dark" ? "rgba(255,45,45,0.12)" : "rgba(204,0,0,0.08)",
                                border: `1px solid ${theme === "dark" ? M.errorLight : M.error}44`,
                                borderRadius: 6, padding: "6px 10px", letterSpacing: 0.5
                            }}>
                                {errorMsg}
                            </div>
                        )}
                        <AttemptHistory attempts={attempts} theme={theme} />
                    </div>

                    {/* ── Mode selector ── */}
                    {cameraActive && status === "camera_active" && (
                        <div style={{ display: "flex", gap: 8, marginBottom: 10, animation: "floatIn 0.3s ease both" }}>
                            {(["login", "register"] as Mode[]).map(m => (
                                <button key={m} onClick={() => setMode(m)} style={{
                                    flex: 1, padding: "8px", borderRadius: 8,
                                    border: `1px solid ${mode === m ? M.green : (theme === "dark" ? M.greenBorder : c.border)}`,
                                    background: mode === m ? `${M.green}22` : "transparent",
                                    color: mode === m ? M.green : (theme === "dark" ? M.greenDim : c.muted),
                                    fontSize: 10, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit"
                                }}>
                                    {m === "login" ? "◉ IDENTIFICAR" : "◈ REGISTRAR"}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Registration warning */}
                    {!hasRegistered && cameraActive && (
                        <div style={{
                            marginBottom: 10, fontSize: 10,
                            color: theme === "dark" ? M.warnDark : M.warn,
                            background: theme === "dark" ? "rgba(184,255,0,0.08)" : "rgba(122,140,0,0.08)",
                            border: `1px solid ${theme === "dark" ? M.warnDark : M.warn}55`,
                            borderRadius: 6, padding: "6px 10px", letterSpacing: 0.5
                        }}>
                            Sin cara registrada. Usa REGISTRAR para guardar tu cara primero.
                        </div>
                    )}

                    {/* ── Buttons ── */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, animation: "floatIn 0.5s ease 0.3s both" }}>
                        {!cameraActive ? (
                            <button onClick={startCamera}
                                disabled={["loading_models", "camera_permission"].includes(status)}
                                style={{
                                    padding: "15px",
                                    background: status === "idle" ? (theme === "dark" ? `${M.green}18` : "#0d0d0d") : "transparent",
                                    border: `1px solid ${status === "idle" ? M.green : (theme === "dark" ? M.greenBorder : c.border)}`,
                                    borderRadius: 9, color: status === "idle" ? M.green : (theme === "dark" ? M.greenDim : c.muted),
                                    fontSize: 12, letterSpacing: 2,
                                    cursor: status === "idle" ? "pointer" : "not-allowed",
                                    fontFamily: "inherit", opacity: status === "idle" ? 1 : 0.5,
                                    textShadow: status === "idle" ? `0 0 8px ${M.green}88` : "none"
                                }}
                                onMouseOver={e => { if (status !== "idle") return; e.currentTarget.style.background = theme === "dark" ? `${M.green}28` : "#1a1a1a"; }}
                                onMouseOut={e => { if (status !== "idle") return; e.currentTarget.style.background = theme === "dark" ? `${M.green}18` : "#0d0d0d"; }}>
                                ◎ ACTIVAR CÁMARA
                            </button>
                        ) : (
                            <button onClick={mode === "login" ? handleIdentify : handleRegister}
                                disabled={status !== "camera_active"}
                                style={{
                                    padding: "15px",
                                    background: status === "camera_active" ? (theme === "dark" ? `${M.green}22` : "#0d0d0d") : "transparent",
                                    border: `1px solid ${status === "camera_active" ? M.green : (theme === "dark" ? M.greenBorder : c.border)}`,
                                    borderRadius: 9, color: status === "camera_active" ? M.green : (theme === "dark" ? M.greenDim : c.muted),
                                    fontSize: 12, letterSpacing: 2,
                                    cursor: status === "camera_active" ? "pointer" : "not-allowed",
                                    fontFamily: "inherit", opacity: status === "camera_active" ? 1 : 0.45
                                }}
                                onMouseOver={e => { if (status !== "camera_active") return; e.currentTarget.style.background = theme === "dark" ? `${M.green}33` : "#1a1a1a"; }}
                                onMouseOut={e => { if (status !== "camera_active") return; e.currentTarget.style.background = theme === "dark" ? `${M.green}22` : "#0d0d0d"; }}>
                                {mode === "login" ? "◉ INICIAR IDENTIFICACIÓN" : "◈ REGISTRAR CARA"}
                            </button>
                        )}
                        <button onClick={handleReset}
                            style={{
                                padding: "11px", background: "transparent",
                                border: `1px solid ${theme === "dark" ? M.greenBorder : c.border}`,
                                borderRadius: 9, color: theme === "dark" ? M.greenDim : c.muted,
                                fontSize: 10, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit"
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = theme === "dark" ? `${M.errorLight}88` : "#c00"; e.currentTarget.style.color = theme === "dark" ? M.errorLight : M.error; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = theme === "dark" ? M.greenBorder : c.border; e.currentTarget.style.color = theme === "dark" ? M.greenDim : c.muted; }}>
                            ⬡ REINICIAR SISTEMA
                        </button>
                    </div>

                    <div style={{
                        marginTop: "auto", paddingTop: 22, textAlign: "center",
                        fontSize: 9, letterSpacing: 2, color: theme === "dark" ? M.greenDim : c.subtext, opacity: 0.5
                    }}>
                        NEXUS ID BIOMETRIC SYSTEM © 2026 · v2.4.1
                    </div>
                </div>
            )}
        </div>
    );
}