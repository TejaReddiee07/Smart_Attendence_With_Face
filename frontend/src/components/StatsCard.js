import React from 'react';

const StatsCard = ({ title, value, icon, color }) => (
  <div className="stats-card" style={{ '--color': color }}>
    <div className="stats-icon">{icon}</div>
    <div className="stats-number">{value}</div>
    <div className="stats-title">{title}</div>
  </div>
);

export default StatsCard;
