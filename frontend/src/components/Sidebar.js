import React from 'react';

const Sidebar = ({ activeSection, setActiveSection, currentBranch, setCurrentBranch }) => {
  const menuItems = [
    { id: 'manageStudents', icon: '👥', label: 'Manage Students' },
    { id: 'attendanceRecords', icon: '📋', label: 'Attendance Records' },
    { id: 'markAttendance', icon: '🎥', label: 'Mark Attendance' },
  ];

  return (
    <div className="sidebar-menu">
      {menuItems.map(item => (
        <button
          key={item.id}
          className={`sidebar-btn ${activeSection === item.id ? 'active' : ''}`}
          onClick={() => setActiveSection(item.id)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
};

export default Sidebar;
