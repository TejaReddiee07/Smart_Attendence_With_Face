// src/api.js
import { getToken } from "./auth";
import { API_BASE } from "./config";

export async function apiFetch(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // Optional global error handling
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "API request failed");
  }

  return response;
}
