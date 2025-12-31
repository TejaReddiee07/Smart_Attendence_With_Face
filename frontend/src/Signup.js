// src/Signup.js
import React, { useState } from "react";
import { API_BASE } from "./config";

const Signup = ({ onSignupSuccess, goToLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
const res = await fetch(`${API_BASE}/api/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});


      const data = await res.json();
      console.log("signup response:", res.status, data);

      if (!data.success) {
        setMsg(data.error || "Signup failed");
        return;
      }

      onSignupSuccess(data.token);
    } catch (err) {
      console.error("signup error:", err);
      setMsg("Server error. Please try again.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h2>Sign Up</h2>
        {msg && <div className="error-msg">{msg}</div>}

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">Create Account</button>
        </form>

        <p style={{ marginTop: 10, fontSize: 14 }}>
          Already have an account?{" "}
          <button type="button" onClick={goToLogin}>
            Login
          </button>
        </p>
      </div>
    </div>
  );
};

export default Signup;
