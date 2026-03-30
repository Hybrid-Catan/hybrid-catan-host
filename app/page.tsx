"use client";
import { useRef } from "react";

export default function Host() {
  const pcRef = useRef<RTCPeerConnection | null>(null);

  async function connect() {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;

    const socket = new WebSocket(`${process.env.NEXT_PUBLIC_HOST_WS}`);

    socket.onopen = async () => {
      // Get camera once, here only
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const localVideo = document.getElementById("localVideo") as HTMLVideoElement;
      if (localVideo) localVideo.srcObject = stream;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", offer }));
    };

    socket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "answer") {
        await pc.setRemoteDescription(data.answer);
      } else if (data.type === "ice") {
        await pc.addIceCandidate(data.candidate);
      }
    };

    // Single onicecandidate — relay candidates to player via signaling
    pc.onicecandidate = (event) => {
      if (event.candidate && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ice", candidate: event.candidate }));
      }
    };
  }

  return (
    <div>
      <video id="localVideo" autoPlay playsInline muted />
      <button onClick={connect}>Connect</button>
    </div>
  );
}