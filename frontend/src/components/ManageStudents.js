// src/components/ManageStudents.js
import React, { useState, useEffect, useRef, useCallback } from 'react';


const API_BASE = 'http://localhost:5000';

const ManageStudents = ({ branch, setBranch, onStatsUpdate }) => {
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState({
    admissionNo: '',
    name: '',
    specialization: '',
    email: '',
    semester: '1',
  });

  const [enrollingStudent, setEnrollingStudent] = useState(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const loadStudents = useCallback(async () => {
  try {
    const res = await fetch(`${API_BASE}/api/students/${branch}`);
    const data = await res.json();
    setStudents(data);
  } catch (error) {
    console.log('Load students failed:', error);
  }
}, [branch]);


 useEffect(() => {
  loadStudents();
}, [loadStudents]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('📤 Adding student:', formData);

    try {
      const res = await fetch(`${API_BASE}/api/add_student`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admission_no: formData.admissionNo.trim(),
          name: formData.name.trim(),
          branch: branch,
          specialization: formData.specialization.trim(),
          email: formData.email.trim(),
          semester: formData.semester,
        }),
      });

      console.log('📡 Response status:', res.status);

      const data = await res.json();
      console.log('📄 Response data:', data);

      if (res.ok && data.success) {
        alert(`✅ ${data.message}`);
        setFormData({
          admissionNo: '',
          name: '',
          specialization: '',
          email: '',
          semester: '1',
        });
        await loadStudents();
        onStatsUpdate?.();
      } else {
        alert(`❌ ${data.error || 'Unknown error!'}`);
      }
    } catch (error) {
      console.error('Network error:', error);
      alert('❌ Network error - Check if backend is running on port 5000');
    }
  };

  // ====== MARK ATTENDANCE FUNCTION ======
  const markAttendance = async () => {
    if (!videoRef.current || !canvasRef.current) {
      alert('❌ Webcam not ready!');
      return;
    }

    console.log('📸 Capturing face...');

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    ctx.drawImage(video, 0, 0, 320, 240);

    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    console.log('📷 Image captured:', imageDataUrl.substring(0, 50) + '...');

    try {
      const res = await fetch(`${API_BASE}/api/mark_attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageDataUrl,
          branch: branch,
        }),
      });

      console.log('📡 Response:', res.status);

      const data = await res.json();
      console.log('📄 Result:', data);

      if (res.ok && data.success) {
        alert(`✅ ${data.message}\nConfidence: ${data.confidence}`);
        onStatsUpdate?.();
        loadStudents();
      } else {
        alert(`❌ ${data.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Network error:', error);
      alert('❌ Network error - Check backend!');
    } finally {
      stopCamera();
      setIsMarkingAttendance(false);
    }
  };

  // ====== DELETE ONLY FROM students TABLE ======
const deleteStudent = async (admissionNo) => {
  const studentName =
    students.find((s) => s.admission_no === admissionNo)?.name || admissionNo;

  if (
    !window.confirm(
      `🗑️ Delete "${studentName}" (${admissionNo})?\n\n⚠️ This will also REMOVE their FACE DATA from attendance system!\nThey won't be able to mark attendance anymore.`
    )
  ) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/delete_student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admission_no: admissionNo }),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      window.alert(
        `✅ ${
          data.message || 'Student deleted + face data removed successfully!'
        }`
      );
      await loadStudents();
      onStatsUpdate?.();
    } else {
      window.alert(`❌ ${data.error || 'Error deleting student!'}`);
    }
  } catch (err) {
    console.error(err);
    window.alert('❌ Network error deleting student!');
  }
};



  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      window.alert('Cannot access camera');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const handleEnrollClick = async (student) => {
    if (student.face_enrolled) {
      window.alert('✅ Face already enrolled for this student');
      return;
    }
    setEnrollingStudent(student);
    setIsEnrolling(true);
    await startCamera();
  };

  const captureFrameAsDataURL = () => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg');
  };

  const enrollFace = async () => {
    if (!enrollingStudent) {
      window.alert('No student selected for enrollment');
      return;
    }

    const imageDataUrl = captureFrameAsDataURL();
    if (!imageDataUrl) {
      window.alert('Could not capture image from camera');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/enroll_face`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admission_no: enrollingStudent.admission_no,
          name: enrollingStudent.name,
          image: imageDataUrl,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.alert(`✅ ${data.message || 'Face enrolled successfully!'}`);
        await loadStudents();
      } else {
        window.alert(`❌ ${data.error || 'Error enrolling face'}`);
      }
    } catch (err) {
      console.error(err);
      window.alert('❌ Error enrolling face (network)');
    } finally {
      setIsEnrolling(false);
      stopCamera();
    }
  };

  const handleMarkAttendanceClick = async () => {
    setIsMarkingAttendance(true);
    await startCamera();
  };

  const branches = ['CSE', 'AIML', 'AIDS', 'ECE', 'MECH'];

  return (
    <div>
      <div className="branch-tabs">
        {branches.map((b) => (
          <button
            key={b}
            className={`tab-btn ${branch === b ? 'active' : ''}`}
            onClick={() => setBranch(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <form className="form-grid" onSubmit={handleSubmit}>
        <input
          className="form-input"
          placeholder="Admission No *"
          value={formData.admissionNo}
          onChange={(e) =>
            setFormData({ ...formData, admissionNo: e.target.value })
          }
          required
        />
        <input
          className="form-input"
          placeholder="Student Name *"
          value={formData.name}
          onChange={(e) =>
            setFormData({ ...formData, name: e.target.value })
          }
          required
        />
        <input
          className="form-input"
          placeholder="Specialization"
          value={formData.specialization}
          onChange={(e) =>
            setFormData({ ...formData, specialization: e.target.value })
          }
        />
        <input
          className="form-input"
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={(e) =>
            setFormData({ ...formData, email: e.target.value })
          }
        />
        <select
          className="form-select"
          value={formData.semester}
          onChange={(e) =>
            setFormData({ ...formData, semester: e.target.value })
          }
        >
          {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
            <option key={s} value={s}>
              Semester {s}
            </option>
          ))}
        </select>
        <button type="submit" className="form-btn">
          ➕ Add Student
        </button>
      </form>

      {/* MARK ATTENDANCE BUTTON */}
      <div
        style={{
          margin: '1rem 0',
          padding: '1rem',
          background: '#f0f9ff',
          borderRadius: '8px',
          border: '2px dashed #3b82f6',
        }}
      >
        <button
          className="btn-primary"
          style={{ width: '100%', padding: '0.75rem', fontSize: '1.1em' }}
          onClick={handleMarkAttendanceClick}
          disabled={isMarkingAttendance}
        >
          {isMarkingAttendance ? '📸 Capturing...' : '🎥 MARK ATTENDANCE NOW'}
        </button>
      </div>

      <div>
        {students.map((student) => (
          <div key={student.admission_no} className="student-item">
            <div>
              <h3>{student.name}</h3>
              <p>
                ID: {student.admission_no} · {branch} · Semester{' '}
                {student.semester}
              </p>
              {student.email && <p>📧 {student.email}</p>}
              <span
                className={`face-status ${
                  student.face_enrolled ? 'enrolled' : 'pending'
                }`}
              >
                {student.face_enrolled ? '✅ Face Enrolled' : '⏳ Face Pending'}
              </span>
            </div>
            <div className="student-actions">
              <button
                className="btn-small btn-enroll"
                disabled={student.face_enrolled}
                onClick={() => handleEnrollClick(student)}
              >
                {student.face_enrolled ? '✅ Enrolled' : '🎥 Enroll Face'}
              </button>
              <button
                className="btn-small btn-delete"
                onClick={() => deleteStudent(student.admission_no)}
              >
                🗑️ Delete
              </button>
            </div>
          </div>
        ))}
        {students.length === 0 && (
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            No students in this branch yet.
          </p>
        )}
      </div>

      {/* ENROLL FACE CAMERA */}
      {isEnrolling && (
        <div
          className="camera-container"
          style={{
            marginTop: '0.75rem',
            width: 320,
            borderRadius: 8,
            overflow: 'hidden',
            border: '2px solid #4f46e5',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <canvas
            ref={canvasRef}
            style={{ display: 'none' }}
            width={320}
            height={240}
          />
          <button
            className="capture-btn"
            style={{ width: '100%', padding: '0.4rem' }}
            onClick={enrollFace}
          >
            📸 Capture & Enroll
          </button>
        </div>
      )}

      {/* MARK ATTENDANCE CAMERA */}
      {isMarkingAttendance && (
        <div
          className="camera-container"
          style={{
            marginTop: '0.75rem',
            width: 320,
            borderRadius: 8,
            overflow: 'hidden',
            border: '2px solid #10b981',
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
          <canvas
            ref={canvasRef}
            style={{ display: 'none' }}
            width={320}
            height={240}
          />
          <button
            className="capture-btn"
            style={{
              width: '100%',
              padding: '0.4rem',
              background: '#10b981',
              color: 'white',
            }}
            onClick={markAttendance}
          >
            ✅ Capture Attendance
          </button>
        </div>
      )}
    </div>
  );
};

export default ManageStudents;
