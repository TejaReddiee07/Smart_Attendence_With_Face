// src/App.js
import React, { useState, useEffect } from "react";
import "./App.css";

import Sidebar from "./components/Sidebar";
import StatsCard from "./components/StatsCard";
import ManageStudents from "./components/ManageStudents";
import AttendanceRecords from "./components/AttendanceRecords";
import MarkAttendance from "./components/MarkAttendance";
import AdminPanel from "./components/AdminPanel";

import { API_BASE } from "./config";
import { getToken, setToken, clearToken, isLoggedIn } from "./auth";
import Login from "./Login";
import Signup from "./Signup";

function DashboardApp() {
  const [activeSection, setActiveSection] = useState("manageStudents");
  const [stats, setStats] = useState({ total: 0, today_present: 0 });
  const [currentBranch, setCurrentBranch] = useState("CSE");
  const [selectedStudent, setSelectedStudent] = useState(null);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.log("Stats fetch failed:", error);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleEnrollClick = (student) => {
    setSelectedStudent(student);
  };

  const getHeaderTitle = () => {
    if (activeSection === "manageStudents") return "👥 Manage Students";
    if (activeSection === "attendanceRecords") return "📋 Attendance Records";
    if (activeSection === "markAttendance") return "🎥 Mark Attendance";
    if (activeSection === "admin") return "👑 Admin Panel";
    return "";
  };

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>📊 Smart Attendance</h1>
        </div>
        <StatsCard
          title="Total Students"
          value={stats.total}
          icon="👥"
          color="#4facfe"
        />
        <StatsCard
          title="Today's Present"
          value={stats.today_present}
          icon="✅"
          color="#00f2fe"
        />
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          currentBranch={currentBranch}
          setCurrentBranch={setCurrentBranch}
        />
      </div>

      {/* Main Content */}
      <div className="main-content">
        <div className="header">
          <h2>{getHeaderTitle()}</h2>
          <button
            className="admin-btn"
            onClick={() => setActiveSection("admin")}
          >
            <i className="fas fa-user-shield" /> Admin
          </button>
        </div>

        {/* Sections */}
        {activeSection === "manageStudents" && (
          <ManageStudents
            branch={currentBranch}
            setBranch={setCurrentBranch}
            onStatsUpdate={fetchStats}
            onEnroll={handleEnrollClick}
            selectedStudent={selectedStudent}
          />
        )}

        {activeSection === "attendanceRecords" && (
          <AttendanceRecords
            branch={currentBranch}
            setBranch={setCurrentBranch}
          />
        )}

        {activeSection === "markAttendance" && (
          <MarkAttendance onStatsUpdate={fetchStats} />
        )}

        {activeSection === "admin" && <AdminPanel />}
      </div>
    </div>
  );
}

function App() {
  const [authed, setAuthed] = useState(isLoggedIn());
  const [screen, setScreen] = useState(isLoggedIn() ? "dashboard" : "login");

const handleLoginSuccess = (token) => {
  setToken(token);          // token must be a string
  setAuthed(true);
  setScreen("dashboard");
};

const handleSignupSuccess = (token) => {
  setToken(token);
  setAuthed(true);
  setScreen("dashboard");
};

  const handleLogout = async () => {
    try {
      const token = getToken();
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (_) {}
    clearToken();
    setAuthed(false);
    setScreen("login");
  };

  if (!authed) {
    if (screen === "signup") {
      return (
        <Signup
          onSignupSuccess={handleSignupSuccess}
          goToLogin={() => setScreen("login")}
        />
      );
    }
    return (
      <Login
        onLoginSuccess={handleLoginSuccess}
        goToSignup={() => setScreen("signup")}
      />
    );
  }

  // Authed view: dashboard + existing functionality
  return (
    <>
      <button
        className="admin-btn"
        style={{ position: "fixed", top: 16, right: 16, zIndex: 1000 }}
        onClick={handleLogout}
      >
        Logout
      </button>
      <DashboardApp />
    </>
  );
}

export default App;
