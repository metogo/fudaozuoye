import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './style.css';
import './home.css';
import './work.css';
import './capture.css';
import './folio.css';
import './controls.css';
import './review.css';
import './flat.css';

// A native dialog can move focus to its first button as it opens on touch.
// Track the input that initiated navigation before the dialog changes focus.
document.addEventListener('pointerdown', () => {
  document.documentElement.setAttribute('data-pointer-focus', '');
}, { capture: true, passive: true });
document.addEventListener('keydown', event => {
  if (['Tab', 'Enter', ' ', 'Escape', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key) || event.key.startsWith('Arrow')) {
    document.documentElement.removeAttribute('data-pointer-focus');
  }
}, true);
createRoot(document.getElementById('root')).render(<App />);
