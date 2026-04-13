"use client";
import { useRef, useState, useEffect } from "react";
import Script from "next/script";
import { findHomographyPoints, applyHomography } from "@/backend/computervision/homography";

declare const cv: any;

export default function Scanner() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const warpCanvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState("Loading OpenCV...");
    const animFrameRef = useRef<number | null>(null);

    // Sync warpCanvas into the homography module's expected DOM element
    // applyHomography uses document.getElementById("warpCanvas") internally,
    // so we give the canvas that id.
    useEffect(() => {
        if (warpCanvasRef.current) {
            warpCanvasRef.current.id = "warpCanvas";
        }
    }, []);

    const processFrame = () => {
        if (!videoRef.current || !canvasRef.current) return;

        // Guard: cv may not be ready yet
        if (typeof cv === "undefined" || !cv.imread) {
            animFrameRef.current = requestAnimationFrame(processFrame);
            return;
        }

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const src = cv.imread(canvas);
        const gray = new cv.Mat();
        const corners = new cv.MatVector();
        const ids = new cv.Mat();
        const rejected = new cv.MatVector();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const dictionary = cv.getPredefinedDictionary(8); // 8 = DICT_6X6_50
        const parameters = new cv.aruco_DetectorParameters();
        const refine = new cv.aruco_RefineParameters(10, -1, true);
        const detector = new cv.aruco_ArucoDetector(dictionary, parameters, refine);

        detector.detectMarkers(gray, corners, ids, rejected);

        if (ids.rows > 0) {
            const homoPts = findHomographyPoints(ids, corners);

            if (homoPts) {
                applyHomography(src, homoPts); // writes to #warpCanvas internally
                setStatus("System Active: Tracking");
            } else {
                // Report which corner markers are still missing
                const foundIds = Array.from(
                    { length: ids.rows },
                    (_, i) => ids.intPtr(i, 0)[0]
                );
                const needed = [0, 2, 5, 7].filter((id) => !foundIds.includes(id));
                setStatus(`Waiting for markers: ${needed.join(", ")}`);
            }
        } else {
            setStatus("No markers detected");
        }

        // Cleanup — including dictionary, parameters, refine which were missing before
        [src, gray, corners, ids, rejected, detector, dictionary, parameters, refine]
            .forEach((obj) => obj.delete());

        // rAF is always scheduled regardless of detection result
        animFrameRef.current = requestAnimationFrame(processFrame);
    };

    const initScanner = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });

            if (!videoRef.current) return;

            videoRef.current.srcObject = stream;
            videoRef.current.onloadedmetadata = () => {
                if (!videoRef.current || !canvasRef.current) return;
                canvasRef.current.width = videoRef.current.videoWidth;
                canvasRef.current.height = videoRef.current.videoHeight;
                videoRef.current.play();
                setStatus("Detecting...");

                // Cancel any previous loop before starting a new one
                if (animFrameRef.current !== null) {
                    cancelAnimationFrame(animFrameRef.current);
                }
                animFrameRef.current = requestAnimationFrame(processFrame);
            };
        } catch {
            setStatus("Camera access denied.");
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <Script
                src="https://docs.opencv.org/4.10.0/opencv.js"
                onLoad={() => setStatus("OpenCV loaded — press Start")}
            />
            <div className="p-2 bg-black text-white rounded">{status}</div>

            {/* Hidden video feed — source for canvas drawing */}
            <video ref={videoRef} className="hidden" playsInline />

            <div className="flex gap-4">
                {/* Main viewfinder */}
                <canvas ref={canvasRef} className="border-2 border-gray-500 w-full max-w-md" />
                {/* Warped homography output — id set via useEffect so applyHomography can find it */}
                <canvas ref={warpCanvasRef} className="border-2 border-blue-500 w-48" />
            </div>

            <button
                onClick={initScanner}
                className="px-4 py-2 bg-blue-600 text-white rounded"
            >
                Start Scanner
            </button>
        </div>
    );
}