// TODO: Temporary comment for testing
// Main entry point for the VSCode webview application
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BridgeProvider } from './bridge/context';
import { createVSCodeBridge } from './bridge/vscode-bridge';
import './styles/globals.css';
import './styles/theme.css';

const bridge = createVSCodeBridge();

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <BridgeProvider bridge={bridge}>
      <App />
    </BridgeProvider>
  </React.StrictMode>
);
