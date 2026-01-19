// src/components/MarkAttendance.js
import React, { useState, useRef, useEffect, useCallback } from "react";
import { API_BASE } from "../config";
import { getToken } from "../auth";

const MarkAttendance = ({ branch, onStatsUpdate }) => {
  const [status, setStatus] = useState("ready");
  const [result, setResult] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timeoutRef = useRef(null);

  // ✅ FIXED: captureFrameAsDataURL
  const captureFrameAsDataURL = useCallback(() => {
    if (!videoRef.current) return null;
    const video = videoRef.current;

    // ✅ Fixed canvas size
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL("image/jpeg", 0.8); // Quality 80%
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // ✅ FIXED: Send 'image' + 'branch' to match backend + JWT header
  const captureAndProcess = useCallback(async () => {
    if (!videoRef.current) {
      setStatus("error");
      setResult("Webcam not ready");
      return;
    }

    console.log("📸 Capturing frame..."); // DEBUG

    const imageDataUrl = captureFrameAsDataURL();
    if (!imageDataUrl) {
      setStatus("error");
      setResult("Failed to capture frame");
      stopCamera();
      return;
    }

    console.log("✅ Image captured:", imageDataUrl.substring(0, 50) + "..."); // DEBUG

    try {
      setStatus("processing");

      const token = getToken();
      console.log("MarkAttendance token:", token);

      // ✅ Send { image, branch } - Backend expects THIS!
      // ✅ Add Authorization header
      const res = await fetch(`${API_BASE}/api/mark_attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          image: imageDataUrl, // ← CHANGED from 'frame' to 'image'
          branch: branch || "CSE", // ← ADDED branch!
        }),
      });

      console.log("📡 Response status:", res.status); // DEBUG

      const data = await res.json();
      console.log("📄 Backend result:", data); // DEBUG

      if (res.ok && data.success) {
        setStatus("success");
        setResult({
          name: data.student,
          admission_no: data.admission_no,
          confidence: parseFloat(data.confidence),
        });
        if (onStatsUpdate) onStatsUpdate();
      } else {
        setStatus("no_face");
        setResult(data.error || "No match found");
      }
    } catch (err) {
      console.error("Network error:", err);
      setStatus("error");
      setResult("Backend not running - Check python app.py");
    } finally {
      stopCamera();
    }
  }, [branch, onStatsUpdate, captureFrameAsDataURL, stopCamera]);

  // ✅ startCameraAndDetect - Added branch prop
  const startCameraAndDetect = useCallback(async () => {
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 320,
          height: 240,
          facingMode: "user", // Front camera
        },
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise((resolve) => {
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play();
            resolve(null);
          };
        });
      }

      setStatus("detecting");
      timeoutRef.current = setTimeout(captureAndProcess, 1000); // 1 second delay
    } catch (err) {
      console.error("Camera error:", err);
      setStatus("error");
      setResult("Camera access denied - Allow camera permission");
    }
  }, [captureAndProcess]);

  // Auto restart if no face
  useEffect(() => {
    if (status === "no_face") {
      const timer = setTimeout(() => {
        setStatus("ready");
        setResult(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <div className="mark-attendance-container">
      <div className="attendance-header">
        <h3>🎥 Auto Mark Attendance - {branch}</h3>
        <p>Position face in frame and wait...</p>
      </div>

      {/* ✅ CAMERA VIEW */}
      {(status === "starting" ||
        status === "detecting" ||
        status === "processing") && (
        <div className="camera-auto-container">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="camera-auto-video"
          />
          <div className="detection-overlay">
            <div className={`status-indicator ${status}`}>
              <i
                className={`fas ${
                  status === "starting"
                    ? "fa-spinner fa-spin"
                    : status === "detecting"
                    ? "fa-search"
                    : "fa-brain"
                }`}
              />
              <span>
                {status === "starting" && "🔄 Starting camera..."}
                {status === "detecting" && "🔍 Detecting face..."}
                {status === "processing" && "⚡ Sending to server..."}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ✅ SUCCESS */}
      {status === "success" && result && (
        <div className="success-result">
          <i className="fas fa-check-circle fa-3x"></i>
          <h3>✅ Attendance Marked!</h3>
          <div className="students-list">
            <div className="student-marked">
              <span className="student-name">{result.name}</span>
              <span className="student-id">({result.admission_no})</span>
              <span className="confidence">
                {(result.confidence * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <button className="retry-btn" onClick={startCameraAndDetect}>
            📸 Mark Another
          </button>
        </div>
      )}

      {/* ✅ ERROR / NO FACE */}
      {(status === "no_face" || status === "error") && result && (
        <div className={`error-result ${status === "no_face" ? "no-face" : ""}`}>
          <i
            className={`fas fa-${
              status === "no_face" ? "user-slash" : "exclamation-triangle"
            } fa-3x`}
          ></i>
          <h3>
            {status === "no_face" ? "👤 No Face Detected" : "❌ Detection Failed"}
          </h3>
          <p>{result}</p>
          <button className="retry-btn" onClick={startCameraAndDetect}>
            🔄 Try Again
          </button>
        </div>
      )}

      {/* ✅ READY BUTTON */}
      {status === "ready" && (
        <div className="ready-state">
          <button className="btn-primary" onClick={startCameraAndDetect}>
            📸 Start Detection
          </button>
        </div>
      )}
    </div>
  );
};

export default MarkAttendance;
