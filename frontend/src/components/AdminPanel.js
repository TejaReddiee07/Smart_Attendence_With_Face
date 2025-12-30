import React, { useState, useEffect } from 'react';

const AdminPanel = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false); // Skip API call since hardcoding
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <i className="fas fa-spinner fa-spin fa-3x"></i>
        <p>Loading admin details...</p>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-card">
        <div className="admin-photo-section">
          <div className="admin-photo">
            <img src="/static_uploads/Nagateja Goli.jpg" alt="Nagateja Goli" />
          </div>
        </div>
        
        <div className="admin-info">
          <h2>Nagateja Goli</h2>
          <div className="admin-contact">
            <div className="contact-item">
              <i className="fas fa-envelope"></i>
              <span>nagatejareddygoli@gmail.com</span>
            </div>
            <div className="contact-item">
              <i className="fas fa-phone"></i>
              <span>+91 7994693055</span>
            </div>
          </div>
          
          <div className="admin-stats">
            <div className="stat-item">
              <div className="stat-number">1500+</div>
              <div className="stat-label">Total Students</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">98%</div>
              <div className="stat-label">Attendance Rate</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">5</div>
              <div className="stat-label">Branches</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
