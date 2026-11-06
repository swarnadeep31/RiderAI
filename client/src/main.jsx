import 'leaflet/dist/leaflet.css';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ServerWaking from './components/ServerWaking.jsx';
import { followDeviceTheme } from './lib/theme.js';

followDeviceTheme();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <ServerWaking />
  </StrictMode>,
);
