import { io } from 'socket.io-client';

/** Default server URL for collaboration features */
const DEFAULT_SERVER_URL = 'http://localhost:4000';

/** Local storage keys */
const STORAGE_KEYS = {
  COLLAB_ENABLED: 'pepen.collab.enabled',
  CLIENT_ID: 'pepen.clientId',
  USER: 'pepen.user',
};

/**
 * Get the collaboration server URL from environment or default
 * @returns {string} The server URL
 */
export function getServerUrl() {
  return String(process.env.REACT_APP_SERVER_URL || DEFAULT_SERVER_URL);
}

/**
 * Check if collaboration features are enabled
 * Priority: env var > localStorage > default (true)
 * @returns {boolean} Whether collaboration is enabled
 */
export function isCollabEnabled() {
  const fromEnv = String(process.env.REACT_APP_COLLAB || '').trim();
  if (fromEnv === '1' || fromEnv.toLowerCase() === 'true') return true;
  if (fromEnv === '0' || fromEnv.toLowerCase() === 'false') return false;

  // default ON for the prototype, but can be disabled locally
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEYS.COLLAB_ENABLED);
    if (fromStorage === '0') return false;
    if (fromStorage === '1') return true;
  } catch {
    // localStorage may not be available
  }
  return true;
}

/**
 * Get or create a unique client ID for this browser session
 * @returns {string} Unique client identifier
 */
export function getOrCreateClientId() {
  try {
    const existing = localStorage.getItem(STORAGE_KEYS.CLIENT_ID);
    if (existing) return existing;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEYS.CLIENT_ID, id);
    return id;
  } catch {
    // localStorage may not be available - generate ephemeral ID
    return `ephemeral-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Load saved user profile from localStorage
 * @returns {{userId: string, name: string, email: string}|null} User object or null
 */
export function loadUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const name = String(parsed.name || '').trim();
    const email = String(parsed.email || '').trim();
    const userId = String(parsed.userId || email || name || '').trim();
    if (!name) return null;
    return { userId, name, email };
  } catch {
    return null;
  }
}

/**
 * Save user profile to localStorage
 * @param {{name?: string, email?: string, userId?: string}} user - User data to save
 * @returns {{userId: string, name: string, email: string}} Normalized user object
 */
export function saveUser(user) {
  const next = {
    userId: String(user?.userId || user?.email || user?.name || '').trim(),
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim(),
  };
  try {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(next));
  } catch {
    // localStorage may not be available
  }
  return next;
}

/**
 * Create a new Socket.IO connection to the collaboration server
 * @returns {Socket} Socket.IO socket instance
 */
export function connectSocket() {
  const url = getServerUrl();
  return io(url, {
    transports: ['websocket', 'polling'],
    timeout: 5000,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });
}

/** Status labels in Danish */
const STATUS_LABELS = {
  draft: 'Kladde',
  in_review: 'Til review',
  review: 'Til review',
  approved: 'Godkendt',
  published: 'Publiceret',
};

/**
 * Map a status code to a Danish display label
 * @param {string} status - Status code
 * @returns {string} Danish label
 */
export function mapStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  return STATUS_LABELS[key] || String(status || 'Kladde');
}
