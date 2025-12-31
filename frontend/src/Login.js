// src/Login.js
import React, { useState } from "react";
import { API_BASE } from "./config";

const Login = ({ onLoginSuccess, goToSignup }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});


      const data = await res.json();
      console.log("login response:", res.status, data);

      if (!data.success) {
        if (data.code === "NO_USER") {
          setMsg("User not found. Please sign up first.");
          // don't auto-redirect; let user click Sign up
        } else {
          setMsg(data.error || "Login failed");
        }
        return;
      }

      onLoginSuccess(data.token);
    } catch (err) {
      console.error("login error:", err);
      setMsg("Server error. Please try again.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <h2>Login</h2>
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

          <button type="submit">Login</button>
        </form>

        <p style={{ marginTop: 10, fontSize: 14 }}>
          No account?{" "}
          <button type="button" onClick={goToSignup}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

export default Login;
