"use client";

import { useEffect, useRef, useState } from "react";
import * as faceapi from "face-api.js";

export default function FaceCam() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  // ✅ Cargar modelos
  async function loadModels() {
    try {
      setError(null);
      const MODEL_URL = "/models";

      await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);

      setModelsLoaded(true);
    } catch (e) {
      console.error(e);
      setError("No se pudieron cargar los modelos. Revisa /public/models y la ruta /models.");
    }
  }

  function euclideanDistance(a: number[], b: number[]) {
    return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0));
  }

  // ✅ Analizar canvas (snapshot) y guardar descriptor (REGISTRO)
  async function analyzeSnapshotAndSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!modelsLoaded) {
      setError("Modelos no cargados todavía.");
      return;
    }

    setInfo(null);
    setDistance(null);

    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setError("No se detectó ninguna cara. Prueba con más luz y mirando a cámara.");
      return;
    }

    setError(null);

    const descriptor = Array.from(detection.descriptor);
    localStorage.setItem("face_descriptor_demo", JSON.stringify(descriptor));

    setInfo("✅ REGISTRO OK: cara detectada y descriptor guardado en localStorage (face_descriptor_demo).");
  }

  // ✅ LOGIN: comparar descriptor actual con el guardado
  async function loginWithFace() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!modelsLoaded) {
      setError("Modelos no cargados todavía.");
      return;
    }

    const stored = localStorage.getItem("face_descriptor_demo");
    if (!stored) {
      setError("No hay cara registrada. Pulsa primero “Capturar + Guardar descriptor”.");
      return;
    }

    setInfo(null);
    setDistance(null);

    const storedDescriptor = JSON.parse(stored) as number[];

    const detection = await faceapi
      .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      setError("No se detectó ninguna cara para el login.");
      return;
    }

    const currentDescriptor = Array.from(detection.descriptor);
    const d = euclideanDistance(storedDescriptor, currentDescriptor);
    setDistance(d);

    const THRESHOLD = 0.55;

    if (d < THRESHOLD) {
      setError(null);
      setInfo(`✅ LOGIN CORRECTO (distancia ${d.toFixed(3)} < ${THRESHOLD})`);
    } else {
      setInfo(null);
      setError(`❌ LOGIN FALLIDO (distancia ${d.toFixed(3)} ≥ ${THRESHOLD})`);
    }
  }

  // ✅ Capturar frame del vídeo al canvas
  function capture(then: "save" | "login") {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth;
    const h = video.videoHeight;

    if (!w || !h) {
      setError("La cámara aún no está lista (videoWidth/videoHeight = 0).");
      return;
    }

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);

    if (then === "save") analyzeSnapshotAndSave();
    if (then === "login") loginWithFace();
  }

  function resetRegisteredFace() {
    localStorage.removeItem("face_descriptor_demo");
    setError(null);
    setInfo("🗑️ Registro borrado. Vuelve a capturar para registrar de nuevo.");
    setDistance(null);
  }

  // ✅ Arrancar cámara + cargar modelos
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function startCamera() {
      try {
        setError(null);

        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });

        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        setCameraReady(true);
      } catch (e) {
        console.error(e);
        setError("No se pudo acceder a la cámara. Revisa permisos del navegador.");
      }
    }

    startCamera();
    loadModels();

    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div style={{ display: "grid", gap: 12, maxWidth: 720 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Face Login — Registro + Login</h2>

      <p style={{ opacity: 0.8 }}>
        Cámara: {cameraReady ? "✅" : "⏳"} — Modelos: {modelsLoaded ? "✅" : "⏳"}
        {distance !== null ? ` — Distancia: ${distance.toFixed(3)}` : ""}
      </p>

      {error && (
        <div style={{ padding: 12, border: "1px solid #fca5a5", borderRadius: 8 }}>
          {error}
        </div>
      )}

      {info && (
        <div style={{ padding: 12, border: "1px solid #86efac", borderRadius: 8 }}>
          {info}
        </div>
      )}

      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb" }}
      />

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={() => capture("save")}
          disabled={!cameraReady || !modelsLoaded}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            cursor: cameraReady && modelsLoaded ? "pointer" : "not-allowed",
            fontWeight: 600,
          }}
        >
          Capturar + Registrar (guardar descriptor)
        </button>

        <button
          onClick={() => capture("login")}
          disabled={!cameraReady || !modelsLoaded}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            cursor: cameraReady && modelsLoaded ? "pointer" : "not-allowed",
            fontWeight: 600,
          }}
        >
          Capturar + Login (comparar)
        </button>

        <button
          onClick={resetRegisteredFace}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            fontWeight: 600,
          }}
        >
          Borrar registro
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb" }}
      />
    </div>
  );
}
