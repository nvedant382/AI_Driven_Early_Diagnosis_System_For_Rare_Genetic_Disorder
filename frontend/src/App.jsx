import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Register from './Register';
import Dashboard from './Dashboard';

function App() {
  const [token, setToken] = useState(() => {
    const saved = localStorage.getItem('user_token');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem('user_token', JSON.stringify(token));
    } else {
      localStorage.removeItem('user_token');
    }
  }, [token]);

  const handleLogout = () => {
    setToken(null);
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={!token ? <Login setToken={setToken} /> : <Navigate to="/" />}
        />
        <Route
          path="/register"
          element={!token ? <Register /> : <Navigate to="/" />}
        />
        <Route
          path="/"
          element={
            token ? (
              <Dashboard user={token} onLogout={handleLogout} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
