"use client";

import { useRef, useState } from "react";
import Script from "next/script";
import { findHomographyPoints, applyHomography } from "@/backend/computervision/homography";

declare const cv: any;

export default function Scanner() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const warpCanvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState("Loading OpenCV...");

    const processFrame = () => {
        if (!cv || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        // Draw video to hidden processing canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

        const dictionary = cv.getPredefinedDictionary(cv.DICT_6X6_50);
        const detector = new cv.aruco_ArucoDetector(dictionary, new cv.aruco_DetectorParameters());
        const corners = new cv.MatVector();
        const ids = new cv.Mat();

        detector.detectMarkers(gray, corners, ids);

        if (ids.rows > 0) {
            const homoPts = findHomographyPoints(cv, ids, corners);
            if (homoPts && warpCanvasRef.current) {
                applyHomography(cv, src, homoPts, warpCanvasRef.current);
                setStatus("System Active: Tracking");
            }
        }

        // Clean up WASM memory
        [src, gray, ids, corners, detector].forEach(obj => obj.delete());
        requestAnimationFrame(processFrame);
    };

    const initScanner = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    canvasRef.current!.width = videoRef.current!.videoWidth;
                    canvasRef.current!.height = videoRef.current!.videoHeight;
                    videoRef.current!.play();
                    processFrame();
                };
            }   
        } catch (err) {
            setStatus("Camera access denied.");
        }
    };

    return (
        <div className="flex flex-col items-center gap-4">
            <Script
                src="https://docs.opencv.org/4.10.0/opencv.js"
                onLoad={() => setStatus("OpenCV Loaded. Starting Camera...")}
            />

            <div className="p-2 bg-black text-white rounded">{status}</div>

            {/* Hidden Video Feed */}
            <video ref={videoRef} className="hidden" playsInline />

            <div className="flex gap-4">
                {/* Main Viewfinder */}
                <canvas ref={canvasRef} className="border-2 border-gray-500 w-full max-w-md" />
                {/* Warped Output */}
                <canvas ref={warpCanvasRef} className="border-2 border-blue-500 w-48" />
            </div>

            <button onClick={initScanner} className="px-4 py-2 bg-blue-600 text-white rounded">
                Start Scanner
            </button>
        </div>
    );
}