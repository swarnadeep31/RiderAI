// Day and night mode. The page follows the device's setting until the visitor
// clicks the sun (or the moon); then their choice is remembered in this browser.
// index.html applies the saved choice before the page draws, so it never flashes.
import { useSyncExternalStore } from 'react';

const KEY = 'trailcast-theme';
const listeners = new Set();
let fadeTimer;

function savedTheme() {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch {
    return null;
  }
}

const deviceQuery = () => window.matchMedia?.('(prefers-color-scheme: dark)');
const wantsLessMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function currentTheme() {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function applyTheme(theme, { fade = false } = {}) {
  const root = document.documentElement;
  if (fade && !wantsLessMotion()) {
    root.classList.add('theme-fade');
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 1000);
  }
  root.classList.toggle('dark', theme === 'dark');
  listeners.forEach((listener) => listener());
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Private windows may not allow saving; the switch still works for this visit.
  }
  applyTheme(next, { fade: true });
}

// Keeps following the device's setting (e.g. it turns dark at sunset) until the visitor chooses.
export function followDeviceTheme() {
  deviceQuery()?.addEventListener('change', (event) => {
    if (!savedTheme()) applyTheme(event.matches ? 'dark' : 'light', { fade: true });
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}
