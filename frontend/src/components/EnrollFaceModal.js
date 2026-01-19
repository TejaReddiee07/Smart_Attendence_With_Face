// src/components/EnrollFaceModal.js
import React, { useState, useRef, useCallback } from 'react';

const EnrollFaceModal = ({ student, onClose, onSuccess }) => {
  const [status, setStatus] = useState('idle'); // idle, capturing, processing, success, error
  const [statusMessage, setStatusMessage] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef();
  const canvasRef = useRef();

  // ====== MAIN ENROLLMENT FUNCTION ======
  const handleEnrollment = async (imageData) => {
    setStatus('processing');
    setStatusMessage('Processing face...');
    
    try {
      const response = await fetch('http://localhost:5000/api/enroll_face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admission_no: student.admission_no,
          name: student.name,
          image: imageData
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        setStatus('success');
        setStatusMessage(result.message);
        onSuccess(); // Refresh student list
        setTimeout(onClose, 2000); // Auto close after success
      } else {
        // BEAUTIFUL ERROR DISPLAY
        setStatus('error');
        setStatusMessage(result.error);
        
        // Show duplicate warning modal
        if (result.error.includes('already enrolled') || result.error.includes('Face already enrolled')) {
          showDuplicateWarning(result.error);
        }
      }
    } catch (error) {
      setStatus('error');
      setStatusMessage('Network error - Please try again');
    }
  };

  // ====== BEAUTIFUL DUPLICATE WARNING MODAL ======
  const showDuplicateWarning = (message) => {
    // Create beautiful custom modal instead of alert
    const modal = document.createElement('div');
    modal.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(0,0,0,0.8); backdrop-filter: blur(10px);
        display: flex; align-items: center; justify-content: center;
        z-index: 9999; font-family: 'Inter', sans-serif;
      ">
        <div style="
          background: linear-gradient(135deg, #fef3c7, #fde68a);
          border: 2px solid #f59e0b; border-radius: 24px;
          padding: 3rem 2.5rem; max-width: 500px; text-align: center;
          box-shadow: 0 25px 50px rgba(245,158,11,0.4);
          animation: bounceIn 0.5s ease;
        ">
          <div style="font-size: 3rem; margin-bottom: 1.5rem;">🚫</div>
          <h3 style="color: #92400e; font-size: 1.5rem; font-weight: 800; margin: 0 0 1rem 0;">
            Face Already Enrolled!
          </h3>
          <div style="
            background: rgba(251,191,36,0.2); border-radius: 16px;
            padding: 1.5rem; margin-bottom: 2rem; white-space: pre-line;
            font-size: 1.1rem; font-weight: 600; line-height: 1.5;
          ">${message}</div>
          <button onclick="this.closest('div').parentElement.remove()" style="
            background: linear-gradient(135deg, #f59e0b, #d97706);
            color: white; border: none; padding: 1rem 2.5rem;
            border-radius: 50px; font-size: 1.1rem; font-weight: 700;
            cursor: pointer; box-shadow: 0 10px 25px rgba(245,158,11,0.4);
            transition: all 0.3s ease;
          " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 15px 35px rgba(245,158,11,0.5)'"
             onmouseout="this.style.transform=''; this.style.boxShadow='0 10px 25px rgba(245,158,11,0.4)'">
            Got it!
          </button>
        </div>
      </div>
      <style>
        @keyframes bounceIn {
          0% { transform: scale(0.3); opacity: 0; }
          50% { transform: scale(1.05); }
          70% { transform: scale(0.9); }
          100% { transform: scale(1); opacity: 1; }
        }
      </style>
    `;
    document.body.appendChild(modal.firstElementChild);
  };

  // ====== CAMERA FUNCTIONS ======
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480, facingMode: 'user' } 
      });
      videoRef.current.srcObject = stream;
      setStatus('capturing');
    } catch (err) {
      setStatus('error');
      setStatusMessage('Camera access denied');
    }
  };

  const captureFace = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    
    const imageData = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedImage(imageData);
    
    // Auto-enroll after capture
    setTimeout(() => handleEnrollment(imageData), 500);
  };

  // ====== RENDER ======
  return (
    <div className="enroll-modal-overlay">
      <div className="enroll-modal">
        <div className="modal-header">
          <h3>Enroll Face for {student.name}</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {status === 'idle' && (
          <div className="modal-start">
            <div className="avatar">{student.name.charAt(0)}</div>
            <h4>{student.name}</h4>
            <p>{student.admission_no}</p>
            <button className="start-camera-btn" onClick={startCamera}>
              🎥 Start Camera
            </button>
          </div>
        )}

        {(status === 'capturing' || status === 'processing') && (
          <div className="modal-camera">
            <video ref={videoRef} autoPlay muted playsInline />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            
            <div className={`status-display ${status}`}>
              {status === 'capturing' && (
                <>
                  <div className="face-circle">
                    <i className="fas fa-circle-notch fa-spin"></i>
                  </div>
                  <p>Position your face in frame</p>
                  <button className="capture-btn" onClick={captureFace}>
                    📸 Capture & Enroll
                  </button>
                </>
              )}
              
              {status === 'processing' && (
                <>
                  <div className="spinner"></div>
                  <p>{statusMessage}</p>
                </>
              )}
            </div>
          </div>
        )}

        {status === 'success' && (
          <div className="modal-success">
            <div className="success-icon">✅</div>
            <h3>{statusMessage}</h3>
          </div>
        )}

        {status === 'error' && (
          <div className="modal-error">
            <div className="error-icon">❌</div>
            <h3>Error</h3>
            <p>{statusMessage}</p>
            <div className="error-actions">
              <button className="retry-btn" onClick={() => setStatus('capturing')}>
                🔄 Retry
              </button>
              <button className="cancel-btn" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnrollFaceModal;
