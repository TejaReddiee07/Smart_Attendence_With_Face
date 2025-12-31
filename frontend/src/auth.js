// src/auth.js
const TOKEN_KEY = "smart_attendance_token";

export const getToken = () => {
  const raw = localStorage.getItem(TOKEN_KEY);
  // always return a plain string or null
  return typeof raw === "string" && raw.trim() ? raw : null;
};

export const setToken = (token) => {
  if (typeof token === "string" && token.trim()) {
    localStorage.setItem(TOKEN_KEY, token);
  }
};

export const clearToken = () => {
  localStorage.removeItem(TOKEN_KEY);
};

export const isLoggedIn = () => !!getToken();
