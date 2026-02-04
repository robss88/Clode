import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Import from source for hot reloading
import '@claude-agent/ui/styles/globals.css';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
