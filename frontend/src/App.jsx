import React, { useState } from "react";
import { Helmet } from 'react-helmet-async';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import JoinScreen from "./components/JoinScreen";
import Dashboard from "./views/Dashboard";
import DocumentView from "./views/DocumentView";
import { HelmetProvider } from 'react-helmet-async';

function App() {
  const [token, setToken] = useState(localStorage.getItem("docu-sync-token") || "");

  const handleAuth = (authData) => {
    localStorage.setItem("docu-sync-userName", authData.name);
    localStorage.setItem("docu-sync-userId", authData.userId);
    localStorage.setItem("docu-sync-userColor", authData.color);
    // Token is already set in localStorage by JoinScreen, but we sync state here
    setToken(authData.token);
  };

  return (
    <HelmetProvider>
      <Router>
        <Routes>
          <Route 
            path="/" 
            element={token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />} 
          />
          <Route
            path="/login"
            element={token ? <Navigate to="/dashboard" replace /> : <JoinScreen onJoin={handleAuth} />}
          />
          <Route
            path="/dashboard"
            element={token ? <Dashboard setToken={setToken} /> : <Navigate to="/login" replace />}
          />
          <Route 
            path="/doc/:roomId" 
            element={<DocumentView />} 
          />
        </Routes>
      </Router>
    </HelmetProvider>
  );
}

export default App;