// src/components/Dashboard.js
import React from 'react';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();

  const menuItems = [
    { id: 'manage', title: '👨‍🎓 Manage Students', icon: 'fas fa-users', path: '/manage-students/AIML' },
    { id: 'attendance', title: '🎥 Mark Attendance', icon: 'fas fa-camera', path: '/mark-attendance' },
    { id: 'search', title: '🔍 Search Student', icon: 'fas fa-search', path: '/search-student' },
    { id: 'records', title: '📋 Attendance Records', icon: 'fas fa-calendar-check', path: '/attendance-records' }
  ];

  return (
    <div className="dashboard-container">
      <div className="hero-section">
        <div className="hero-overlay">
          <h1 className="hero-title">Automated Facial Attendance Recorder</h1>
          <p className="hero-subtitle">AI-Powered Face Recognition System</p>
        </div>
      </div>

      <div className="action-buttons-section">
        <div className="buttons-grid">
          {menuItems.map((item) => (
            <div key={item.id} className="action-card" onClick={() => navigate(item.path)}>
              <div className="card-icon"><i className={item.icon}></i></div>
              <div className="card-content">
                <h3>{item.title}</h3>
              </div>
              <div className="card-arrow"><i className="fas fa-arrow-right"></i></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
// In your main Dashboard/Main component
import AttendanceRecords from './AttendanceRecords';

// Inside your JSX:
<div className="dashboard-grid">
  {/* Stats */}
  {/* ManageStudents */}
  
  {/* ✅ ADD THIS */}
  <AttendanceRecords branch={branch} />
</div>
