import React from 'react';
import { createRoot } from 'react-dom/client';
import { BridgeProvider } from './bridge/context';
import { createVSCodeBridge } from './bridge/vscode-bridge';
import App from './App';
import './styles/theme.css';
import './styles/globals.css';

const bridge = createVSCodeBridge();

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <BridgeProvider bridge={bridge}>
      <App />
    </BridgeProvider>
  </React.StrictMode>
);
