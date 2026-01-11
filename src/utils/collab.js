import { io } from 'socket.io-client';

const DEFAULT_SERVER_URL = 'http://localhost:4000';

export function getServerUrl() {
  return String(process.env.REACT_APP_SERVER_URL || DEFAULT_SERVER_URL);
}

export function isCollabEnabled() {
  const fromEnv = String(process.env.REACT_APP_COLLAB || '').trim();
  if (fromEnv === '1' || fromEnv.toLowerCase() === 'true') return true;
  if (fromEnv === '0' || fromEnv.toLowerCase() === 'false') return false;

  // default ON for the prototype, but can be disabled locally
  const fromStorage = localStorage.getItem('pepen.collab.enabled');
  if (fromStorage === '0') return false;
  if (fromStorage === '1') return true;
  return true;
}

export function getOrCreateClientId() {
  const key = 'pepen.clientId';
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(key, id);
  return id;
}

export function loadUser() {
  try {
    const raw = localStorage.getItem('pepen.user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const name = String(parsed.name || '').trim();
    const email = String(parsed.email || '').trim();
    const userId = String(parsed.userId || email || name || '').trim();
    if (!name) return null;
    return { userId, name, email };
  } catch (_) {
    return null;
  }
}

export function saveUser(user) {
  const next = {
    userId: String(user?.userId || user?.email || user?.name || '').trim(),
    name: String(user?.name || '').trim(),
    email: String(user?.email || '').trim(),
  };
  localStorage.setItem('pepen.user', JSON.stringify(next));
  return next;
}

export function connectSocket() {
  const url = getServerUrl();
  return io(url, {
    transports: ['websocket', 'polling'],
    timeout: 5000,
  });
}

export function mapStatusLabel(status) {
  switch (String(status || '').toLowerCase()) {
    case 'draft':
      return 'Kladde';
    case 'in_review':
    case 'review':
      return 'Til review';
    case 'approved':
      return 'Godkendt';
    case 'published':
      return 'Publiceret';
    default:
      return String(status || 'Kladde');
  }
}
