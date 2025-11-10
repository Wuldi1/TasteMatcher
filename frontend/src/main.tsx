import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { AuthProvider } from './contexts/AuthContext';
import { DomainProvider } from './contexts/DomainContext'; // Assuming you have this

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AuthProvider>
      <DomainProvider>
        <App />
      </DomainProvider>
    </AuthProvider>
  </React.StrictMode>
);