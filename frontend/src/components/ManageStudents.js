// src/components/ManageStudents.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { API_BASE } from "../config";
import { getToken } from "../auth";

// helper: numeric value of last 3 digits of ID like "E220160" -> 160
const getLastThree = (adm) => {
  if (!adm || adm.length < 3) return Infinity;
  const last3 = adm.slice(-3);
  const n = parseInt(last3, 10);
  return Number.isNaN(n) ? Infinity : n;
};

const ManageStudents = ({ branch, setBranch, onStatsUpdate }) => {
  const [students, setStudents] = useState([]);
  const [formData, setFormData] = useState({
    admissionNo: "",
    name: "",
    specialization: "",
    email: "",
    semester: "1",
    phone: "",
    fatherName: "",
    village: "",
    dob: "",
  });

  const [enrollingStudent, setEnrollingStudent] = useState(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isMarkingAttendance, setIsMarkingAttendance] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // ===== LOAD STUDENTS (sorted by last 3 digits of admission_no) =====
  const loadStudents = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/students/${branch}`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
      });
      const data = await res.json();

      const sorted = [...data].sort(
        (a, b) => getLastThree(a.admission_no) - getLastThree(b.admission_no)
      );

      setStudents(sorted);
    } catch (error) {
      console.log("Load students failed:", error);
    }
  }, [branch]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("📤 Adding student:", formData);

    const token = getToken();
    console.log("ManageStudents token:", token);

    try {
      const res = await fetch(`${API_BASE}/api/add_student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          admission_no: formData.admissionNo,
          name: formData.name,
          father_name: formData.fatherName,
          village: formData.village,
          branch, // from props
          specialization: formData.specialization,
          email: formData.email,
          phone: formData.phone,
          dob: formData.dob, // NEW: send DOB
          semester: formData.semester,
        }),
      });

      console.log("📡 Response status:", res.status);

      const data = await res.json();
      console.log("📄 Response data:", data);

      if (res.ok && data.success) {
        alert(`✅ ${data.message}`);
        setFormData({
          admissionNo: "",
          name: "",
          specialization: "",
          email: "",
          semester: "1",
          phone: "",
          fatherName: "",
          village: "",
          dob: "",
        });
        await loadStudents(); // reload sorted list
        onStatsUpdate?.();
      } else {
        alert(`❌ ${data.error || "Unknown error!"}`);
      }
    } catch (error) {
      console.error("Network error:", error);
      alert("❌ Network error - Check if backend is running on port 5000");
    }
  };

  // ====== MARK ATTENDANCE FUNCTION ======
  const markAttendance = async () => {
    if (!videoRef.current || !canvasRef.current) {
      alert("❌ Webcam not ready!");
      return;
    }

    console.log("📸 Capturing face...");

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(video, 0, 0, 320, 240);

    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.8);
    console.log("📷 Image captured:", imageDataUrl.substring(0, 50) + "...");

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/mark_attendance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          image: imageDataUrl,
          branch: branch,
        }),
      });

      console.log("📡 Response:", res.status);

      const data = await res.json();
      console.log("📄 Result:", data);

      if (res.ok && data.success) {
        alert(`✅ ${data.message}\nConfidence: ${data.confidence}`);
        onStatsUpdate?.();
        loadStudents();
      } else {
        alert(`❌ ${data.error || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Network error:", error);
      alert("❌ Network error - Check backend!");
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
      const token = getToken();
      console.log("DeleteStudent token:", token);

      const res = await fetch(`${API_BASE}/api/delete_student`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({ admission_no: admissionNo }),
      });

      console.log("DeleteStudent status:", res.status);

      const data = await res.json();
      console.log("DeleteStudent response:", data);

      if (res.ok && data.success) {
        window.alert(
          `✅ ${
            data.message || "Student deleted + face data removed successfully!"
          }`
        );
        await loadStudents();
        onStatsUpdate?.();
      } else {
        window.alert(`❌ ${data.error || "Error deleting student!"}`);
      }
    } catch (err) {
      console.error("DeleteStudent network error:", err);
      window.alert("❌ Network error deleting student!");
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: "user" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error(err);
      window.alert("Cannot access camera");
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
      window.alert("✅ Face already enrolled for this student");
      return;
    }
    setEnrollingStudent(student);
    setIsEnrolling(true);
    await startCamera();
  };

  const captureFrameAsDataURL = () => {
    if (!videoRef.current) return null;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg");
  };

  const enrollFace = async () => {
    if (!enrollingStudent) {
      window.alert("No student selected for enrollment");
      return;
    }

    const imageDataUrl = captureFrameAsDataURL();
    if (!imageDataUrl) {
      window.alert("Could not capture image from camera");
      return;
    }

    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/enroll_face`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token ? `Bearer ${token}` : "",
        },
        body: JSON.stringify({
          admission_no: enrollingStudent.admission_no,
          name: enrollingStudent.name,
          image: imageDataUrl,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        window.alert(`✅ ${data.message || "Face enrolled successfully!"}`);
        await loadStudents(); // re-load sorted list
      } else {
        window.alert(`❌ ${data.error || "Error enrolling face"}`);
      }
    } catch (err) {
      console.error(err);
      window.alert("❌ Error enrolling face (network)");
    } finally {
      setIsEnrolling(false);
      stopCamera();
    }
  };

  const handleMarkAttendanceClick = async () => {
    setIsMarkingAttendance(true);
    await startCamera();
  };

  const branches = ["CSE", "AIML", "AIDS", "ECE", "MECH"];

  return (
    <div>
      <div className="branch-tabs">
        {branches.map((b) => (
          <button
            key={b}
            className={`tab-btn ${branch === b ? "active" : ""}`}
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

        {/* Father Name */}
        <input
          className="form-input"
          placeholder="Father Name"
          value={formData.fatherName}
          onChange={(e) =>
            setFormData({ ...formData, fatherName: e.target.value })
          }
        />

        {/* Phone Number */}
        <input
          className="form-input"
          placeholder="Phone Number"
          value={formData.phone}
          onChange={(e) =>
            setFormData({ ...formData, phone: e.target.value })
          }
        />

        {/* Village */}
        <input
          className="form-input"
          placeholder="Village"
          value={formData.village}
          onChange={(e) =>
            setFormData({ ...formData, village: e.target.value })
          }
        />

        {/* NEW: Date of Birth */}
        <input
          className="form-input"
          type="date"
          placeholder="Date of Birth"
          value={formData.dob}
          onChange={(e) =>
            setFormData({ ...formData, dob: e.target.value })
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
          margin: "1rem 0",
          padding: "1rem",
          background: "#f0f9ff",
          borderRadius: "8px",
          border: "2px dashed #3b82f6",
        }}
      >
        <button
          className="btn-primary"
          style={{ width: "100%", padding: "0.75rem", fontSize: "1.1em" }}
          onClick={handleMarkAttendanceClick}
          disabled={isMarkingAttendance}
        >
          {isMarkingAttendance ? "📸 Capturing..." : "🎥 MARK ATTENDANCE NOW"}
        </button>
      </div>

      <div>
        {students
          .slice()
          .sort(
            (a, b) => getLastThree(a.admission_no) - getLastThree(b.admission_no)
          )
          .map((student) => (
            <div key={student.admission_no} className="student-item">
              <div>
                <h3>{student.name}</h3>
                <p>
                  ID: {student.admission_no} · {branch} · Semester{" "}
                  {student.semester}
                </p>
                {student.email && <p>📧 {student.email}</p>}
                {student.father_name && (
                  <p>👨‍👦 Father: {student.father_name}</p>
                )}
                {student.phone && <p>📞 {student.phone}</p>}
                {student.village && <p>🏡 Village: {student.village}</p>}
                {student.dob && <p>🎂 DOB: {student.dob}</p>}
                <span
                  className={`face-status ${
                    student.face_enrolled ? "enrolled" : "pending"
                  }`}
                >
                  {student.face_enrolled ? "✅ Face Enrolled" : "⏳ Face Pending"}
                </span>
              </div>
              <div className="student-actions">
                <button
                  className="btn-small btn-enroll"
                  disabled={student.face_enrolled}
                  onClick={() => handleEnrollClick(student)}
                >
                  {student.face_enrolled ? "✅ Enrolled" : "🎥 Enroll Face"}
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
          <p style={{ color: "#6b7280", marginTop: "0.5rem" }}>
            No students in this branch yet.
          </p>
        )}
      </div>

      {/* ENROLL FACE CAMERA */}
      {isEnrolling && (
        <div
          className="camera-container"
          style={{
            marginTop: "0.75rem",
            width: 320,
            borderRadius: 8,
            overflow: "hidden",
            border: "2px solid #4f46e5",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          <canvas
            ref={canvasRef}
            style={{ display: "none" }}
            width={320}
            height={240}
          />
          <button
            className="capture-btn"
            style={{ width: "100%", padding: "0.4rem" }}
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
            marginTop: "0.75rem",
            width: 320,
            borderRadius: 8,
            overflow: "hidden",
            border: "2px solid #10b981",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            style={{ width: "100%", height: "auto", display: "block" }}
          />
          <canvas
            ref={canvasRef}
            style={{ display: "none" }}
            width={320}
            height={240}
          />
          <button
            className="capture-btn"
            style={{
              width: "100%",
              padding: "0.4rem",
              background: "#10b981",
              color: "white",
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
