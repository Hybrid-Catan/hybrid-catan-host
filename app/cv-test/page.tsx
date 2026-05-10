/*
 * CatanPortDetector.tsx
 *
 * TypeScript / React port of the Python Catan port-detection pipeline.
 *
 * Pipeline (mirrors the Python source):
 *   Pass 1  – colour-range classification → wheat, wood, brick
 *   Pass 2  – signal table for unresolved blobs (brightness, centre-dark ratio)
 *   Pass 3  – sheep/ore scoring with spatial rules; remainder → 3:1
 *   Pass 4  – draw annotated circles + labels onto an output canvas
 *
 * The component:
 *   • loads OpenCV.js (WASM) from cdnjs once on mount
 *   • opens the user's camera (getUserMedia)
 *   • runs the pipeline on every animation frame
 *   • renders a <canvas> with the annotated result
 */
'use client';
import { useEffect, useRef, useState, useCallback } from "react";

// ─── OpenCV.js type shim ──────────────────────────────────────────────────────
declare global {
    interface Window {
        cv: any;
        Module: any;
    }
}

// ─── Colour constants (BGR order, matching Python) ────────────────────────────
const PORT_COLOR_LOWER = [196, 231, 243]; // BGR
const PORT_COLOR_UPPER = [255, 255, 255]; // BGR

const PORT_COLORS: Record<string, [number, number, number]> = {
    wheat: [0, 200, 255],
    wood: [34, 139, 34],
    brick: [0, 0, 200],
    sheep: [144, 238, 144],
    ore: [128, 128, 128],
    "3to1": [200, 200, 200],
};

const KNOWN_RESOURCE_RANGES: Record<
    string,
    { B: [number, number]; G: [number, number]; R: [number, number] }
> = {
    wheat: { B: [95, 115], G: [140, 160], R: [168, 188] },
    wood: { B: [35, 55], G: [51, 71], R: [84, 104] },
    brick: { B: [61, 81], G: [72, 92], R: [146, 166] },
};

// ─── Pure-TS helpers (no OpenCV dependency) ───────────────────────────────────

function predictResourceFromAvg(bgr: [number, number, number]): string | null {
    const [b, g, r] = bgr;
    for (const [resource, rng] of Object.entries(KNOWN_RESOURCE_RANGES)) {
        if (
            b >= rng.B[0] && b <= rng.B[1] &&
            g >= rng.G[0] && g <= rng.G[1] &&
            r >= rng.R[0] && r <= rng.R[1]
        ) return resource;
    }
    return null;
}

// ─── OpenCV helpers (called inside the frame loop once cv is ready) ───────────

function makeContentMask(
    cv: any,
    imgBgr: any,
    darkThresh = 50,
    brightThresh = 220,
    satThresh = 60
): any {
    const hsv = new cv.Mat();
    cv.cvtColor(imgBgr, hsv, cv.COLOR_BGR2HSV);

    const channels = new cv.MatVector();
    cv.split(hsv, channels);
    const s = channels.get(1);
    const v = channels.get(2);

    // port-background exclusion
    const lowerPort = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_LOWER[0], PORT_COLOR_LOWER[1], PORT_COLOR_LOWER[2], 0]);
    const upperPort = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_UPPER[0], PORT_COLOR_UPPER[1], PORT_COLOR_UPPER[2], 255]);
    const excl = new cv.Mat();
    cv.inRange(imgBgr, lowerPort, upperPort, excl);

    // dark exclusion
    const darkMask = new cv.Mat();
    cv.threshold(v, darkMask, darkThresh, 255, cv.THRESH_BINARY_INV);
    cv.bitwise_or(excl, darkMask, excl);

    // bright exclusion
    const brightMask = new cv.Mat();
    cv.threshold(v, brightMask, brightThresh, 255, cv.THRESH_BINARY);
    cv.bitwise_or(excl, brightMask, excl);

    // low-saturation exclusion
    const satMask = new cv.Mat();
    cv.threshold(s, satMask, satThresh, 255, cv.THRESH_BINARY_INV);
    cv.bitwise_or(excl, satMask, excl);

    const content = new cv.Mat();
    cv.bitwise_not(excl, content);

    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(content, content, cv.MORPH_OPEN, kernel);

    [hsv, lowerPort, upperPort, excl, darkMask, brightMask, satMask, kernel]
        .forEach(m => m.delete());
    channels.delete(); s.delete(); v.delete();
    return content;
}

function makePortbgOnlyMask(cv: any, imgBgr: any): any {
    const lower = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_LOWER[0], PORT_COLOR_LOWER[1], PORT_COLOR_LOWER[2], 0]);
    const upper = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_UPPER[0], PORT_COLOR_UPPER[1], PORT_COLOR_UPPER[2], 255]);
    const portPx = new cv.Mat();
    cv.inRange(imgBgr, lower, upper, portPx);
    const content = new cv.Mat();
    cv.bitwise_not(portPx, content);
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.morphologyEx(content, content, cv.MORPH_OPEN, kernel);
    [lower, upper, portPx, kernel].forEach(m => m.delete());
    return content;
}

function removeWhiteAndDark(cv: any, imgBgr: any, darkThresh = 40, brightThresh = 230): any {
    const gray = new cv.Mat();
    cv.cvtColor(imgBgr, gray, cv.COLOR_BGR2GRAY);
    const result = imgBgr.clone();
    const rows = imgBgr.rows;
    const cols = imgBgr.cols;
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const g = gray.ucharAt(y, x);
            if (g < darkThresh || g > brightThresh) {
                result.ucharPtr(y, x)[0] = 255;
                result.ucharPtr(y, x)[1] = 255;
                result.ucharPtr(y, x)[2] = 255;
            }
        }
    }
    gray.delete();
    return result;
}

/** Average BGR of the top-50% most saturated pixels inside mask */
function getAvgContentColor(
    cv: any,
    imgBgr: any,
    contentMask: any
): [number, number, number] | null {
    const pixels: number[][] = [];
    const sats: number[] = [];

    for (let y = 0; y < imgBgr.rows; y++) {
        for (let x = 0; x < imgBgr.cols; x++) {
            if (contentMask.ucharAt(y, x) !== 255) continue;
            const ptr = imgBgr.ucharPtr(y, x);
            const b = ptr[0], g = ptr[1], r = ptr[2];
            const max = Math.max(b, g, r), min = Math.min(b, g, r);
            sats.push(max === 0 ? 0 : (max - min) / max);
            pixels.push([b, g, r]);
        }
    }
    if (pixels.length === 0) return null;

    const thresh = sats.slice().sort((a, b) => a - b)[Math.floor(sats.length * 0.5)];
    const vibrant = pixels.filter((_, i) => sats[i] >= thresh);
    if (vibrant.length === 0) return null;

    const sum = vibrant.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    return [
        Math.round(sum[0] / vibrant.length),
        Math.round(sum[1] / vibrant.length),
        Math.round(sum[2] / vibrant.length),
    ];
}

function classifyByColour(cv: any, crop: any): string {
    if (!crop || crop.empty()) return "unresolved";
    const cropClean = removeWhiteAndDark(cv, crop);
    const cropCm = makeContentMask(cv, crop);
    const nonZero = cv.countNonZero(cropCm);
    cropClean.delete(); cropCm.delete();
    if (nonZero < 30) return "unresolved";

    const cropClean2 = removeWhiteAndDark(cv, crop);
    const cropCm2 = makeContentMask(cv, crop);
    const avg = getAvgContentColor(cv, cropClean2, cropCm2);
    cropClean2.delete(); cropCm2.delete();

    if (avg) {
        const predicted = predictResourceFromAvg(avg);
        if (predicted) return `2:1 ${predicted}`;
    }
    return "unresolved";
}

// ─── Blob detection ───────────────────────────────────────────────────────────

interface BlobInfo {
    cx: number;
    cy: number;
    crop: any; // cv.Mat — caller must delete after use
}

/**
 * Detect port-background blobs in the frame.
 * Returns up to 9 blobs (one per standard Catan port), sorted by area desc.
 * The crop Mat must be deleted by the caller when no longer needed.
 */
function detectPortBlobs(cv: any, frame: any): BlobInfo[] {
    const lower = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_LOWER[0], PORT_COLOR_LOWER[1], PORT_COLOR_LOWER[2], 0]);
    const upper = new cv.Mat(1, 1, cv.CV_8UC3, [PORT_COLOR_UPPER[0], PORT_COLOR_UPPER[1], PORT_COLOR_UPPER[2], 255]);
    const mask = new cv.Mat();
    cv.inRange(frame, lower, upper, mask);

    const kernel = cv.Mat.ones(7, 7, cv.CV_8U);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const blobs: BlobInfo[] = [];
    const minArea = (frame.rows * frame.cols) * 0.0005;
    const maxArea = (frame.rows * frame.cols) * 0.06;

    for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);
        if (area < minArea || area > maxArea) { cnt.delete(); continue; }

        const rect = cv.boundingRect(cnt);
        const pad = 10;
        const x1 = Math.max(0, rect.x - pad);
        const y1 = Math.max(0, rect.y - pad);
        const x2 = Math.min(frame.cols, rect.x + rect.width + pad);
        const y2 = Math.min(frame.rows, rect.y + rect.height + pad);
        const roi = new cv.Rect(x1, y1, x2 - x1, y2 - y1);
        const crop = frame.roi(roi).clone(); // clone so we can free frame later

        const cx = Math.round(rect.x + rect.width / 2);
        const cy = Math.round(rect.y + rect.height / 2);
        blobs.push({ cx, cy, crop });
        cnt.delete();
    }

    [lower, upper, mask, kernel, contours, hierarchy].forEach(m => m.delete());

    // Keep ≤9 largest blobs
    blobs.sort((a, b) => (b.crop.rows * b.crop.cols) - (a.crop.rows * a.crop.cols));
    return blobs.slice(0, 9);
}

// ─── Scoring functions ────────────────────────────────────────────────────────

interface Candidate {
    cx: number; cy: number;
    avgBright: number; totalPix: number; cRatio: number;
    forced3to1: boolean; threeToOneRight: boolean;
}

function oreScore(c: Candidate): number {
    const brightNorm = Math.max(0, Math.min(1, (255 - c.avgBright) / 200));
    const ratioNorm = Math.min(1, c.cRatio / 0.05);
    return (brightNorm + ratioNorm) / 2;
}

function sheepScore(c: Candidate): number {
    const brightNorm = Math.max(0, Math.min(1, (c.avgBright - 100) / 150));
    const pixNorm = Math.min(1, c.totalPix / 12000);
    const spatialBonus = c.threeToOneRight ? 0.4 : 0;
    return Math.min(1, (brightNorm + pixNorm) / 2 + spatialBonus);
}

// ─── Drawing helper ───────────────────────────────────────────────────────────

function drawLabel(
    ctx: CanvasRenderingContext2D,
    label: string,
    cx: number,
    cy: number,
    color: [number, number, number]
) {
    const [b, g, r] = color;
    const radius = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const text = label.toUpperCase().replace("2:1 ", "");
    ctx.font = `bold ${text.length > 4 ? 9 : 11}px 'Cinzel', serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(text, cx + 1, cy + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, cx, cy);
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

interface PortResult {
    cx: number; cy: number; label: string;
}

function runPipeline(cv: any, frame: any): PortResult[] {
    const blobs = detectPortBlobs(cv, frame);
    if (blobs.length === 0) return [];

    // Pass 1 – colour classification
    const pass1: Array<{ cx: number; cy: number; label: string }> = blobs.map(b => ({
        cx: b.cx, cy: b.cy,
        label: classifyByColour(cv, b.crop),
    }));

    // Pass 2 – build signal table for unresolved blobs
    const candidates: Candidate[] = [];

    for (let i = 0; i < pass1.length; i++) {
        const { cx, cy, label } = pass1[i];
        if (label.startsWith("2:1")) continue;

        const crop = blobs[i].crop;
        const pbm = makePortbgOnlyMask(cv, crop);

        // Upscale to 200×200 for consistent measurement
        const img200 = new cv.Mat();
        const mask200 = new cv.Mat();
        const size200 = new cv.Size(200, 200);
        cv.resize(crop, img200, size200, 0, 0, cv.INTER_LINEAR);
        cv.resize(pbm, mask200, size200, 0, 0, cv.INTER_NEAREST);

        const gray = new cv.Mat();
        cv.cvtColor(img200, gray, cv.COLOR_BGR2GRAY);

        // Average brightness of masked pixels
        let sumBright = 0, countMask = 0;
        for (let y = 0; y < 200; y++) {
            for (let x = 0; x < 200; x++) {
                if (mask200.ucharAt(y, x) === 255) {
                    sumBright += gray.ucharAt(y, x);
                    countMask++;
                }
            }
        }
        const avgBright = countMask > 0 ? sumBright / countMask : 255;
        const totalPix = countMask;

        // Centre 40% dark ratio (ore signature)
        const s = 200;
        const y0 = Math.round(s * 3 / 10), y1 = Math.round(s * 7 / 10);
        const x0 = y0, x1 = y1;
        let ct = 0, cDark = 0;
        for (let y = y0; y < y1; y++) {
            for (let x = x0; x < x1; x++) {
                if (mask200.ucharAt(y, x) === 255) {
                    ct++;
                    if (gray.ucharAt(y, x) < 100) cDark++;
                }
            }
        }
        const cRatio = ct > 0 ? cDark / ct : 0;

        // Adjacency checks
        const nearResource = (res: string, radius = 300) =>
            pass1.some(p => p.label === `2:1 ${res}` && Math.hypot(p.cx - cx, p.cy - cy) < radius);

        const forced3to1 =
            nearResource("wheat") || nearResource("wood") || nearResource("brick");

        const has3to1Right = (radius = 350) =>
            pass1.some(p => p.label === "3to1" && (p.cx - cx) > 0 && Math.hypot(p.cx - cx, p.cy - cy) < radius);

        candidates.push({
            cx, cy, avgBright, totalPix, cRatio,
            forced3to1, threeToOneRight: has3to1Right(),
        });

        [pbm, img200, mask200, gray].forEach(m => m.delete());
    }

    // Pass 3 – assign sheep and ore
    const live = candidates.filter(c => !c.forced3to1);
    const oreRanked = [...live].sort((a, b) => oreScore(b) - oreScore(a));
    const sheepRanked = [...live].sort((a, b) => sheepScore(b) - sheepScore(a));

    const assigned = new Map<string, string>();
    const key = (c: Candidate) => `${c.cx},${c.cy}`;

    const ORE_MIN_SCORE = 0.30;
    const SHEEP_MIN_SCORE = 0.30;

    const sheepWithRule = sheepRanked.filter(c => c.threeToOneRight);
    const sheepWithoutRule = sheepRanked.filter(c => !c.threeToOneRight);

    if (sheepWithRule.length > 0 && sheepScore(sheepWithRule[0]) >= SHEEP_MIN_SCORE) {
        assigned.set(key(sheepWithRule[0]), "sheep");
    } else if (sheepWithoutRule.length > 0 && sheepScore(sheepWithoutRule[0]) >= SHEEP_MIN_SCORE) {
        assigned.set(key(sheepWithoutRule[0]), "sheep");
    }

    for (const c of oreRanked) {
        if (!assigned.has(key(c)) && oreScore(c) >= ORE_MIN_SCORE) {
            assigned.set(key(c), "ore");
            break;
        }
    }

    for (const c of candidates) {
        if (!assigned.has(key(c))) assigned.set(key(c), "3to1");
    }

    // Pass 4 – build final results
    const results: PortResult[] = pass1.map(p => {
        if (p.label.startsWith("2:1")) return { cx: p.cx, cy: p.cy, label: p.label };
        const res = assigned.get(`${p.cx},${p.cy}`) ?? "3to1";
        const newLabel = res !== "3to1" ? `2:1 ${res}` : "3to1";
        return { cx: p.cx, cy: p.cy, label: newLabel };
    });

    // Free all blob crops
    blobs.forEach(b => b.crop.delete());

    return results;
}

// ─── React component ──────────────────────────────────────────────────────────

type LoadState = "idle" | "loading-cv" | "ready" | "running" | "error";

export default function CatanPortDetector() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const offscreenRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);
    const cvRef = useRef<any>(null);

    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const [portLabels, setPortLabels] = useState<string[]>([]);
    const [fps, setFps] = useState(0);

    const fpsCountRef = useRef(0);
    const fpsTimeRef = useRef(performance.now());

    // ── Load OpenCV.js ──────────────────────────────────────────────────────────
    const loadOpenCV = useCallback((): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (window.cv?.Mat) { cvRef.current = window.cv; resolve(); return; }
            const script = document.createElement("script");
            script.src = "https://cdn.jsdelivr.net/npm/opencv-browser@latest/opencv.js";
            script.async = true;
            script.onload = () => {
                const check = () => {
                    if (window.cv?.Mat) { cvRef.current = window.cv; resolve(); }
                    else setTimeout(check, 100);
                };
                check();
            };
            script.onerror = () => reject(new Error("Failed to load OpenCV.js"));
            document.head.appendChild(script);
        });
    }, []);

    // ── Frame loop ──────────────────────────────────────────────────────────────
    const processFrame = useCallback(() => {
        const cv = cvRef.current;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!cv || !video || !canvas || video.readyState < 2) {
            rafRef.current = requestAnimationFrame(processFrame);
            return;
        }

        const W = video.videoWidth;
        const H = video.videoHeight;
        if (W === 0 || H === 0) { rafRef.current = requestAnimationFrame(processFrame); return; }

        canvas.width = W;
        canvas.height = H;

        // Draw video onto offscreen canvas, read pixels
        let offscreen = offscreenRef.current;
        if (!offscreen) {
            offscreen = document.createElement("canvas");
            offscreenRef.current = offscreen;
        }
        offscreen.width = W;
        offscreen.height = H;
        const octx = offscreen.getContext("2d")!;
        octx.drawImage(video, 0, 0, W, H);
        const imageData = octx.getImageData(0, 0, W, H);

        // Convert RGBA → BGR cv.Mat
        const rgba = cv.matFromImageData(imageData);
        const bgr = new cv.Mat();
        cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR);
        rgba.delete();

        // Run pipeline
        let results: PortResult[] = [];
        try {
            results = runPipeline(cv, bgr);
        } catch (e) {
            console.error("Pipeline error:", e);
        }
        bgr.delete();

        // Draw annotated output
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(offscreen, 0, 0);

        results.forEach(r => {
            const resKey = r.label.startsWith("2:1")
                ? r.label.split(" ")[1]
                : "3to1";
            const color = PORT_COLORS[resKey] ?? [200, 200, 200];
            drawLabel(ctx, r.label, r.cx, r.cy, color);
        });

        setPortLabels(results.map(r => r.label));

        // FPS counter
        fpsCountRef.current++;
        const now = performance.now();
        if (now - fpsTimeRef.current >= 1000) {
            setFps(fpsCountRef.current);
            fpsCountRef.current = 0;
            fpsTimeRef.current = now;
        }

        rafRef.current = requestAnimationFrame(processFrame);
    }, []);

    // ── Start / stop ─────────────────────────────────────────────────────────────
    const start = useCallback(async () => {
        setLoadState("loading-cv");
        try {
            await loadOpenCV();
        } catch (e) {
            setErrorMsg("Could not load OpenCV.js — check your network.");
            setLoadState("error");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "environment" },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
        } catch (e) {
            setErrorMsg("Camera access denied. Please allow camera permissions.");
            setLoadState("error");
            return;
        }

        setLoadState("running");
        rafRef.current = requestAnimationFrame(processFrame);
    }, [loadOpenCV, processFrame]);

    const stop = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) { videoRef.current.srcObject = null; }
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
        setLoadState("idle");
        setPortLabels([]);
        setFps(0);
    }, []);

    useEffect(() => () => { cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

    // ─── Derived display data ───────────────────────────────────────────────────
    const resourceCounts: Record<string, number> = {};
    portLabels.forEach(l => {
        const k = l.startsWith("2:1") ? l.split(" ")[1] : "3to1";
        resourceCounts[k] = (resourceCounts[k] ?? 0) + 1;
    });

    const RESOURCE_EMOJI: Record<string, string> = {
        wheat: "🌾", wood: "🪵", brick: "🧱", sheep: "🐑", ore: "⛏️", "3to1": "⚓",
    };

    // ─── UI ─────────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#0B0F1A] text-[#E8DFC8] font-['Crimson_Pro',serif]">
            <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&family=Cinzel+Decorative:wght@700&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,400&display=swap');
        .hexbg { background: radial-gradient(ellipse at 60% 0%, rgba(200,134,26,.18) 0%, transparent 60%),
                              radial-gradient(ellipse at 10% 90%, rgba(56,189,248,.10) 0%, transparent 55%),
                              #0B0F1A; }
        .card  { background: rgba(22,28,39,.85); border: 1px solid rgba(200,134,26,.18);
                 border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,.5); }
        .amber { color: #C8861A; text-shadow: 0 0 24px rgba(200,134,26,.5); }
        .badge { display:inline-flex; align-items:center; gap:6px; padding: 4px 10px;
                 border-radius:6px; font-size:11px; letter-spacing:.1em; font-family:'Cinzel',serif; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .spin { animation: spin 1.2s linear infinite; }
        @keyframes scan { 0%{top:0%} 100%{top:100%} }
        .scan { position:absolute; left:0; right:0; height:2px;
                background:linear-gradient(to right,transparent,rgba(56,189,248,.4),transparent);
                animation:scan 2.5s linear infinite; pointer-events:none; }
      `}</style>

            {/* ── Nav ─────────────────────────────────────────────────── */}
            <nav className="sticky top-0 z-30 border-b border-[#C8861A]/20 bg-[#070A12]/95 backdrop-blur px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <svg viewBox="0 0 36 36" className="w-8 h-8">
                        <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${18 + 15 * Math.cos(a)},${18 + 15 * Math.sin(a)}` }).join(" ")}
                            fill="#C8861A" stroke="#F0C060" strokeWidth="1" />
                        <text x="18" y="22" textAnchor="middle" fill="#0B0F1A" fontSize="9" fontWeight="900" fontFamily="Cinzel Decorative,serif">C</text>
                    </svg>
                    <div>
                        <div className="font-['Cinzel_Decorative',serif] text-[#C8861A] text-xs tracking-widest leading-none">CATAN</div>
                        <div className="font-['Cinzel',serif] text-[10px] text-[#E8DFC8]/40 tracking-[.4em] uppercase leading-none">Port Detector</div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {loadState === "running" && (
                        <span className="badge border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 uppercase">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" style={{ animation: "spin 2s linear infinite" }} />{fps} fps
                        </span>
                    )}
                    {loadState === "loading-cv" && (
                        <span className="badge border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 uppercase">
                            <span className="w-3 h-3 rounded-full border-2 border-yellow-400 border-t-transparent spin" /> Loading OpenCV
                        </span>
                    )}
                    {loadState === "error" && (
                        <span className="badge border border-red-500/30 bg-red-500/10 text-red-400 uppercase">⚠ Error</span>
                    )}
                </div>
            </nav>

            <div className="hexbg max-w-6xl mx-auto px-4 py-8 space-y-6">

                {/* ── Title ───────────────────────────────────────────────── */}
                <div className="text-center space-y-2">
                    <p className="font-['Cinzel',serif] text-[11px] tracking-[.5em] text-[#C8861A] uppercase">Computer Vision Pipeline</p>
                    <h1 className="font-['Cinzel_Decorative',serif] text-3xl md:text-5xl amber leading-none">
                        Port Detector
                    </h1>
                    <p className="text-[#8A9BB5] text-sm max-w-lg mx-auto leading-relaxed">
                        Real-time 4-pass CV pipeline — colour classification → signal scoring → sheep/ore assignment → live annotation
                    </p>
                </div>

                {/* ── Main grid ───────────────────────────────────────────── */}
                <div className="grid lg:grid-cols-[1fr_280px] gap-5">

                    {/* Camera + canvas */}
                    <div className="card overflow-hidden">
                        <div className="relative bg-black" style={{ aspectRatio: "16/9" }}>
                            {/* Hidden video element — feeds frames to the canvas pipeline */}
                            <video ref={videoRef} className="absolute inset-0 w-full h-full object-contain opacity-0 pointer-events-none" playsInline muted />

                            {/* Annotated output canvas */}
                            <canvas ref={canvasRef} className="w-full h-full object-contain" />

                            {loadState === "running" && <div className="scan" />}

                            {loadState !== "running" && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-[#070A12]/90">
                                    <svg viewBox="0 0 80 80" className="w-16 h-16 opacity-30">
                                        <polygon points={Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return `${40 + 34 * Math.cos(a)},${40 + 34 * Math.sin(a)}` }).join(" ")}
                                            fill="none" stroke="#C8861A" strokeWidth="2" />
                                        <text x="40" y="46" textAnchor="middle" fill="#C8861A" fontSize="18">⚓</text>
                                    </svg>
                                    <div className="text-center space-y-1">
                                        <p className="font-['Cinzel',serif] text-xs tracking-[.3em] text-[#4A5875] uppercase">
                                            {loadState === "loading-cv" ? "Loading OpenCV WASM…" :
                                                loadState === "error" ? errorMsg :
                                                    "Camera not started"}
                                        </p>
                                        {loadState === "error" && (
                                            <p className="text-[10px] text-red-400/60 max-w-xs">{errorMsg}</p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Corner brackets */}
                            {(["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"] as const).map((pos, i) => (
                                <div key={i} className={`absolute ${pos} w-4 h-4 pointer-events-none`} style={{
                                    borderTop: i < 2 ? "2px solid rgba(200,134,26,.7)" : undefined,
                                    borderBottom: i >= 2 ? "2px solid rgba(200,134,26,.7)" : undefined,
                                    borderLeft: i % 2 === 0 ? "2px solid rgba(200,134,26,.7)" : undefined,
                                    borderRight: i % 2 === 1 ? "2px solid rgba(200,134,26,.7)" : undefined,
                                }} />
                            ))}

                            {loadState === "running" && (
                                <div className="absolute top-2 left-1/2 -translate-x-1/2 badge border border-red-500/40 bg-[#070A12]/80 text-red-400 uppercase">
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400" style={{ animation: "spin 2s linear infinite" }} /> LIVE
                                </div>
                            )}
                        </div>

                        {/* Controls bar */}
                        <div className="px-5 py-4 border-t border-[#2A3347] flex items-center gap-3">
                            {loadState !== "running" ? (
                                <button onClick={start} disabled={loadState === "loading-cv"}
                                    className="px-7 py-2.5 font-['Cinzel',serif] font-bold text-xs uppercase tracking-[.2em]
                    bg-gradient-to-br from-[#D4921E] to-[#A86B10] text-[#0B0F1A]
                    hover:from-[#E8A52A] hover:to-[#C07E18] hover:scale-105
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
                    transition-all duration-200"
                                    style={{ clipPath: "polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)" }}>
                                    {loadState === "loading-cv" ? "⏳ Loading…" : "▶ Start Detection"}
                                </button>
                            ) : (
                                <button onClick={stop}
                                    className="px-7 py-2.5 font-['Cinzel',serif] font-bold text-xs uppercase tracking-[.2em]
                    border border-[#38BDF8]/40 text-[#38BDF8]
                    hover:border-[#38BDF8] hover:bg-[#38BDF8]/10 hover:scale-105
                    transition-all duration-200"
                                    style={{ clipPath: "polygon(10px 0%,100% 0%,calc(100% - 10px) 100%,0% 100%)" }}>
                                    ⏹ Stop
                                </button>
                            )}
                            <p className="text-[#4A5875] text-xs font-['Cinzel',serif] tracking-wider uppercase">
                                {portLabels.length > 0 ? `${portLabels.length} port${portLabels.length !== 1 ? "s" : ""} detected` : "No ports detected"}
                            </p>
                        </div>
                    </div>

                    {/* ── Sidebar ─────────────────────────────────────────── */}
                    <div className="space-y-4">

                        {/* Detected ports */}
                        <div className="card p-4">
                            <p className="font-['Cinzel',serif] text-[10px] tracking-[.4em] text-[#C8861A] uppercase mb-3">Detected Ports</p>
                            {portLabels.length === 0 ? (
                                <p className="text-[#3A4A60] text-xs italic">Waiting for detection…</p>
                            ) : (
                                <div className="space-y-1.5">
                                    {portLabels.map((l, i) => {
                                        const resKey = l.startsWith("2:1") ? l.split(" ")[1] : "3to1";
                                        const [pb, pg, pr] = PORT_COLORS[resKey] ?? [200, 200, 200];
                                        return (
                                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-[#2A3347] bg-[#0A0F18]">
                                                <span className="w-3 h-3 rounded-full flex-shrink-0"
                                                    style={{ background: `rgb(${pr},${pg},${pb})` }} />
                                                <span className="font-['Cinzel',serif] text-[10px] tracking-wider text-[#8A9BB5] flex-1 uppercase">
                                                    {RESOURCE_EMOJI[resKey]} {l.toUpperCase()}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Summary counts */}
                        <div className="card p-4">
                            <p className="font-['Cinzel',serif] text-[10px] tracking-[.4em] text-[#C8861A] uppercase mb-3">Resource Summary</p>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(RESOURCE_EMOJI).map(([res, emoji]) => {
                                    const count = resourceCounts[res] ?? 0;
                                    const [pb, pg, pr] = PORT_COLORS[res] ?? [200, 200, 200];
                                    return (
                                        <div key={res} className={`flex items-center gap-2 px-2.5 py-2 rounded border transition-all duration-300
                      ${count > 0 ? "border-[#2A3347] bg-[#161C27]" : "border-[#161C27] bg-[#090D15] opacity-40"}`}>
                                            <span className="text-sm">{emoji}</span>
                                            <div className="min-w-0">
                                                <p className="font-['Cinzel',serif] text-[9px] tracking-widest uppercase truncate"
                                                    style={{ color: `rgb(${pr},${pg},${pb})` }}>{res}</p>
                                                <p className="font-['Cinzel',serif] text-sm font-bold text-[#E8DFC8] leading-none">{count}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Pipeline legend */}
                        <div className="card p-4">
                            <p className="font-['Cinzel',serif] text-[10px] tracking-[.4em] text-[#C8861A] uppercase mb-3">Pipeline Passes</p>
                            <div className="space-y-2 text-xs text-[#5A6A80]">
                                {[
                                    ["01", "Colour Range", "Wheat · Wood · Brick via BGR matching"],
                                    ["02", "Signal Table", "Brightness · centre dark ratio per blob"],
                                    ["03", "Score & Assign", "Sheep ↔ ore scoring + 3:1 adjacency rule"],
                                    ["04", "Annotate", "Draw labelled circles on live canvas"],
                                ].map(([n, title, desc]) => (
                                    <div key={n} className="flex gap-2">
                                        <span className="font-['Cinzel',serif] text-[#C8861A]/50 flex-shrink-0 font-bold">{n}</span>
                                        <div>
                                            <span className="font-['Cinzel',serif] text-[#8A9BB5] tracking-wide">{title} </span>
                                            <span className="opacity-60">{desc}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}