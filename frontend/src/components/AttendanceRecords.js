// src/components/AttendanceRecords.js
import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:5000';

const AttendanceRecords = ({ branch, setBranch }) => {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeBranch, setActiveBranch] = useState(branch);

  const [branchCounts, setBranchCounts] = useState({
    CSE: 0,
    AIML: 0,
    AIDS: 0,
    ECE: 0,
    MECH: 0,
  });

  const branches = ['CSE', 'AIML', 'AIDS', 'ECE', 'MECH'];

  const loadTodayAttendance = async (selectedBranch) => {
    try {
      setLoading(true);
      console.log('📋 Loading attendance for:', selectedBranch);

      const res = await fetch(`${API_BASE}/api/today_attendance/${selectedBranch}`);
      const data = await res.json();
      console.log('📋 Records loaded:', data);

      const safeData = Array.isArray(data) ? data : [];

      setRecords(safeData);
      setActiveBranch(selectedBranch);

      // ✅ update per-branch counts based on latest data for this branch
      setBranchCounts((prev) => ({
        ...prev,
        [selectedBranch]: safeData.length,
      }));
    } catch (error) {
      console.error('Load attendance failed:', error);
      setRecords([]);
      setBranchCounts((prev) => ({
        ...prev,
        [selectedBranch]: 0,
      }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTodayAttendance(branch);
  }, [branch]);

  // ✅ AUTO REFRESH every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => loadTodayAttendance(activeBranch), 10000);
    return () => clearInterval(interval);
  }, [activeBranch]);

  if (loading) {
    return (
      <div className="attendance-empty">
        <i className="fas fa-spinner fa-spin fa-2x"></i>
        <p>Loading attendance records...</p>
      </div>
    );
  }

  return (
    <div className="attendance-records">
      {/* ✅ BRANCH BUTTONS */}
      <div className="branch-selector">
        {branches.map((b) => (
          <button
            key={b}
            className={`branch-btn ${activeBranch === b ? 'active' : ''}`}
            onClick={() => {
              setBranch(b);
              loadTodayAttendance(b);
            }}
          >
            {b}
            <span className="branch-badge">
              {/* use global counts, not filtered current records */}
              {branchCounts[b] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* ✅ HEADER */}
      <div className="records-header">
        <h3>
          <i className="fas fa-calendar-day"></i>
          {" "}
          Today's Attendance - {activeBranch}
        </h3>
        <div className="header-actions">
          <span className="record-count">
            {records.length} marked today
          </span>
          <button className="refresh-btn" onClick={() => loadTodayAttendance(activeBranch)}>
            <i className="fas fa-sync-alt"></i> Refresh
          </button>
        </div>
      </div>

      {/* ✅ RECORDS */}
      {records.length === 0 ? (
        <div className="attendance-empty">
          <i className="fas fa-users-slash fa-3x"></i>
          <h3>No attendance records today</h3>
          <p>Mark some attendance first to see records here</p>
          <button className="check-updates-btn" onClick={() => loadTodayAttendance(activeBranch)}>
            🔍 Check for Updates
          </button>
        </div>
      ) : (
        <div className="records-list">
          {records.map((record, idx) => (
            <div key={idx} className="attendance-record">
              <div className="record-avatar">
                <i className="fas fa-user-circle"></i>
              </div>
              <div className="record-info">
                <h4>{record.name}</h4>
                <p><i className="fas fa-id-card"></i> {record.admission_no}</p>
                <p>
                  <i className="fas fa-clock"></i>{" "}
                  {new Date(record.timestamp).toLocaleTimeString()}
                </p>
              </div>
              <div className="record-status">
                <span className="status-present">
                  <i className="fas fa-check-circle"></i> Present
                </span>
                <div className="confidence-container">
                  <span className="confidence">{record.confidence}%</span>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${parseFloat(record.confidence)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AttendanceRecords;
