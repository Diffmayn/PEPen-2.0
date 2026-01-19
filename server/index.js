const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

const EXCHANGE_ENABLED = String(process.env.EXCHANGE_ENABLED || '').trim().toLowerCase() === 'true'
  || String(process.env.EXCHANGE_ENABLED || '').trim() === '1';

// POC: hardcoded directory. Go-live: replace with Exchange/Graph directory search.
const MOCK_EMAILS = [
  'rene@example.dk',
  'colleague1@company.dk',
  'colleague2@company.dk',
  'anne.hansen@company.dk',
  'mikkel.nielsen@company.dk',
  'søren@company.dk',
  'jørgen@company.dk',
  'line.pedersen@company.dk',
  'marketing.team@company.dk',
  'qa.proof@company.dk',
];

const COMPANY_EMAIL_DOMAINS = ['company.dk', 'example.dk'];

function nowIso() {
  return new Date().toISOString();
}

function safeString(s) {
  return String(s || '').trim();
}

function isCompanyEmail(email) {
  const e = safeString(email).toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return false;
  const domain = e.slice(at + 1);
  return COMPANY_EMAIL_DOMAINS.includes(domain);
}

function normalizeForSearch(raw) {
  const s = safeString(raw).toLowerCase();
  if (!s) return '';
  // Strip accents and do Danish-friendly folding.
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'o')
    .replace(/å/g, 'aa');
}

function fuzzyIncludes(haystack, needle) {
  const h = normalizeForSearch(haystack);
  const n = normalizeForSearch(needle);
  if (!n) return true;
  return h.includes(n);
}

function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLeafletId(raw) {
  const s = safeString(raw);
  return s || 'unknown';
}

function pickUserColor(userId) {
  const colors = ['#1E88E5', '#8E24AA', '#D81B60', '#43A047', '#F4511E', '#546E7A', '#FB8C00'];
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash |= 0; // eslint-disable-line no-bitwise
  }
  const idx = Math.abs(hash) % colors.length;
  return colors[idx];
}

// In-memory store (MVP)
const leaflets = new Map(); // leafletId -> { doc, rawLeafletXml, fileInfo, layoutByAreaId, status, commentsByOfferId, versions, audit }
const presence = new Map(); // leafletId -> Map(socketId -> { userId, name, email, color, pageIndex })

function ensureLeaflet(leafletId) {
  const id = normalizeLeafletId(leafletId);
  if (!leaflets.has(id)) {
    leaflets.set(id, {
      leafletId: id,
      doc: null,
      rawLeafletXml: null,
      fileInfo: null,
      layoutByAreaId: {},
      status: 'draft',
      commentsByOfferId: {},
      mentionsByEmail: {},
      versions: [],
      audit: [],
    });
  }
  if (!presence.has(id)) presence.set(id, new Map());
  return leaflets.get(id);
}

function getRoomPresence(leafletId) {
  const id = normalizeLeafletId(leafletId);
  return presence.get(id) || new Map();
}

function emitToEmailInRoom(ioServer, leafletId, email, event, payload) {
  const wanted = safeString(email).toLowerCase();
  if (!wanted) return;
  const room = getRoomPresence(leafletId);
  for (const [socketId, u] of room.entries()) {
    const uEmail = safeString(u?.email).toLowerCase();
    if (uEmail && uEmail === wanted) {
      ioServer.to(socketId).emit(event, payload);
    }
  }
}

function addAudit(leafletId, entry) {
  const store = ensureLeaflet(leafletId);
  const item = {
    id: makeId(),
    at: nowIso(),
    ...entry,
  };
  store.audit.unshift(item);
  if (store.audit.length > 2000) store.audit.length = 2000;
  return item;
}

function upsertPresence(leafletId, socketId, user, patch) {
  const id = normalizeLeafletId(leafletId);
  const room = presence.get(id) || new Map();
  presence.set(id, room);

  const userId = safeString(user?.userId) || safeString(user?.email) || socketId;
  const next = {
    userId,
    name: safeString(user?.name) || 'Ukendt',
    email: safeString(user?.email),
    color: pickUserColor(userId),
    pageIndex: typeof patch?.pageIndex === 'number' ? patch.pageIndex : (typeof room.get(socketId)?.pageIndex === 'number' ? room.get(socketId).pageIndex : 0),
  };

  room.set(socketId, next);
  return next;
}

function getPresenceList(leafletId) {
  const id = normalizeLeafletId(leafletId);
  const room = presence.get(id);
  if (!room) return [];
  return Array.from(room.values());
}

const app = express();

// CORS configuration - allow multiple origins for development and production
const ALLOWED_ORIGINS = [
  CLIENT_ORIGIN,
  'http://localhost:3000',
  'http://localhost:4000',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // In development, be permissive
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '2mb' }));

// Serve static files from the React app build folder
const buildPath = path.join(__dirname, '..', 'build');
app.use(express.static(buildPath, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true,
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ ok: true, at: nowIso(), uptime: process.uptime() });
});

app.get('/api/suggest-emails', async (req, res) => {
  const q = safeString(req.query?.q);
  const rawLimit = Number(req.query?.limit);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, rawLimit)) : 10;

  if (EXCHANGE_ENABLED) {
    // Go-live stub: implement Microsoft Graph directory search here.
    // For now, fall back to mock list.
  }

  const items = (MOCK_EMAILS || [])
    .filter((e) => isCompanyEmail(e))
    .filter((e) => fuzzyIncludes(e, q))
    .slice(0, limit)
    .map((email) => ({ id: email, display: email }));

  res.json({ ok: true, items });
});

// Catch-all handler to serve React app for client-side routing
// This must be after all API routes
app.get('*', (req, res, next) => {
  // Don't serve index.html for API routes that weren't found
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Not found' });
  }
  res.sendFile(path.join(buildPath, 'index.html'), (err) => {
    if (err) {
      next(err);
    }
  });
});

// Error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[PEPen server] Error:', err.message);
  res.status(err.status || 500).json({
    ok: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on('connection', (socket) => {
  socket.on('room:join', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const user = payload.user || {};

    socket.join(leafletId);
    ensureLeaflet(leafletId);

    upsertPresence(leafletId, socket.id, user, { pageIndex: payload.pageIndex });

    io.to(leafletId).emit('presence:list', {
      leafletId,
      users: getPresenceList(leafletId),
    });

    const store = ensureLeaflet(leafletId);
    if (store.doc) {
      socket.emit('doc:sync', {
        leafletId,
        state: {
          doc: store.doc,
          rawLeafletXml: store.rawLeafletXml,
          fileInfo: store.fileInfo,
          layoutByAreaId: store.layoutByAreaId,
          status: store.status,
          commentsByOfferId: store.commentsByOfferId,
          versions: store.versions,
          audit: store.audit,
        },
      });
    } else {
      socket.emit('doc:missing', { leafletId });
    }

    const userEmail = safeString(user?.email).toLowerCase();
    if (userEmail) {
      const inbox = store.mentionsByEmail?.[userEmail];
      socket.emit('mentions:list', {
        leafletId,
        items: Array.isArray(inbox) ? inbox.slice(0, 100) : [],
      });
    }

    addAudit(leafletId, {
      type: 'presence',
      message: `${safeString(user?.name) || 'Ukendt'} deltog i sessionen`,
      user: { name: safeString(user?.name), email: safeString(user?.email), userId: safeString(user?.userId) },
    });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });
  });

  socket.on('presence:update', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    if (!leafletId) return;
    const user = payload.user || {};
    upsertPresence(leafletId, socket.id, user, { pageIndex: payload.pageIndex });
    io.to(leafletId).emit('presence:list', { leafletId, users: getPresenceList(leafletId) });
  });

  socket.on('doc:set', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);

    if (!store.doc && payload.doc) {
      store.doc = payload.doc;
      store.rawLeafletXml = payload.rawLeafletXml || null;
      store.fileInfo = payload.fileInfo || null;
      store.layoutByAreaId = payload.layoutByAreaId || {};

      addAudit(leafletId, {
        type: 'doc',
        message: 'Leaflet data blev delt i sessionen',
        user: payload.user || null,
      });
      io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

      io.to(leafletId).emit('doc:sync', {
        leafletId,
        state: {
          doc: store.doc,
          rawLeafletXml: store.rawLeafletXml,
          fileInfo: store.fileInfo,
          layoutByAreaId: store.layoutByAreaId,
          status: store.status,
          commentsByOfferId: store.commentsByOfferId,
          versions: store.versions,
          audit: store.audit,
        },
      });
    }
  });

  socket.on('offer:update', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);
    if (!store.doc) return;

    const areaIndex = payload.areaIndex;
    const blockIndex = payload.blockIndex;
    const changes = payload.changes || {};

    try {
      const next = JSON.parse(JSON.stringify(store.doc));
      const area = next?.areas?.[areaIndex];
      const block = area?.blocks?.[blockIndex];
      if (block?.offer) {
        block.offer = { ...block.offer, ...changes };
        store.doc = next;
      }

      const userName = safeString(payload.user?.name) || 'Ukendt';
      const msg = changes.price
        ? `${userName} ændrede pris på side ${areaIndex + 1}`
        : `${userName} ændrede indhold på side ${areaIndex + 1}`;

      addAudit(leafletId, { type: 'edit', message: msg, user: payload.user || null, details: { areaIndex, blockIndex, changes } });
      io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

      io.to(leafletId).emit('offer:update', {
        leafletId,
        areaIndex,
        blockIndex,
        changes,
        clientId: payload.clientId || null,
      });
    } catch (_) {
      // ignore
    }
  });

  socket.on('layout:update', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);

    const areaId = safeString(payload.areaId);
    const nextLayout = payload.nextLayout;
    if (!areaId) return;

    if (nextLayout == null) {
      const next = { ...(store.layoutByAreaId || {}) };
      delete next[areaId];
      store.layoutByAreaId = next;
    } else {
      if (typeof nextLayout !== 'object') return;
      store.layoutByAreaId = { ...(store.layoutByAreaId || {}), [areaId]: nextLayout };
    }

    const userName = safeString(payload.user?.name) || 'Ukendt';
    addAudit(leafletId, { type: 'layout', message: `${userName} ændrede layout`, user: payload.user || null, details: { areaId } });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

    io.to(leafletId).emit('layout:update', { leafletId, areaId, nextLayout, clientId: payload.clientId || null });
  });

  socket.on('status:set', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);

    const status = safeString(payload.status) || 'draft';
    store.status = status;

    const userName = safeString(payload.user?.name) || 'Ukendt';
    addAudit(leafletId, { type: 'status', message: `${userName} satte status til ${status}`, user: payload.user || null });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

    io.to(leafletId).emit('status:set', { leafletId, status, clientId: payload.clientId || null });
  });

  socket.on('comment:add', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);

    const offerId = safeString(payload.offerId);
    const text = safeString(payload.text);
    if (!offerId || !text) return;

    const comment = {
      id: makeId(),
      at: nowIso(),
      offerId,
      pageIndex: typeof payload.pageIndex === 'number' ? payload.pageIndex : null,
      user: payload.user || null,
      text,
      parentId: payload.parentId || null,
      mentions: Array.isArray(payload.mentions) ? payload.mentions.slice(0, 50) : [],
      offerTitle: safeString(payload.offerTitle) || null,
    };

    const nextMap = { ...(store.commentsByOfferId || {}) };
    const list = Array.isArray(nextMap[offerId]) ? nextMap[offerId].slice(0) : [];
    list.push(comment);
    nextMap[offerId] = list;
    store.commentsByOfferId = nextMap;

    const userName = safeString(payload.user?.name) || 'Ukendt';
    addAudit(leafletId, { type: 'comment', message: `${userName} kommenterede på et tilbud`, user: payload.user || null, details: { offerId } });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

    io.to(leafletId).emit('comment:add', { leafletId, comment, clientId: payload.clientId || null });

    const mentions = (Array.isArray(payload.mentions) ? payload.mentions : [])
      .map((e) => safeString(e).toLowerCase())
      .filter(Boolean)
      .filter((e) => isCompanyEmail(e));

    if (mentions.length) {
      const unique = Array.from(new Set(mentions));
      const fromUser = payload.user || null;
      const snippet = text.length > 120 ? `${text.slice(0, 117)}...` : text;

      for (const email of unique) {
        const entry = {
          id: makeId(),
          at: nowIso(),
          leafletId,
          offerId,
          offerTitle: safeString(payload.offerTitle) || null,
          pageIndex: typeof payload.pageIndex === 'number' ? payload.pageIndex : null,
          mentionedEmail: email,
          fromUser,
          commentId: comment.id,
          commentSnippet: snippet,
        };

        const key = email.toLowerCase();
        const map = store.mentionsByEmail || {};
        const list = Array.isArray(map[key]) ? map[key].slice(0) : [];
        list.unshift(entry);
        if (list.length > 200) list.length = 200;
        store.mentionsByEmail = { ...map, [key]: list };

        emitToEmailInRoom(io, leafletId, email, 'mention:new', { leafletId, entry });
      }
    }
  });

  socket.on('version:save', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);
    if (!store.doc) return;

    const version = {
      id: makeId(),
      at: nowIso(),
      user: payload.user || null,
      summary: safeString(payload.summary) || 'Autosave',
      snapshot: {
        doc: store.doc,
        rawLeafletXml: store.rawLeafletXml,
        fileInfo: store.fileInfo,
        layoutByAreaId: store.layoutByAreaId,
        status: store.status,
        commentsByOfferId: store.commentsByOfferId,
      },
    };

    store.versions.unshift(version);
    if (store.versions.length > 200) store.versions.length = 200;

    const userName = safeString(payload.user?.name) || 'Ukendt';
    addAudit(leafletId, { type: 'version', message: `${userName} gemte en version`, user: payload.user || null, details: { versionId: version.id } });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

    io.to(leafletId).emit('versions:list', { leafletId, versions: store.versions.map((v) => ({ id: v.id, at: v.at, user: v.user, summary: v.summary })) });
  });

  socket.on('version:revert', (payload = {}) => {
    const leafletId = normalizeLeafletId(payload.leafletId);
    const store = ensureLeaflet(leafletId);

    const versionId = safeString(payload.versionId);
    const v = (store.versions || []).find((x) => x.id === versionId);
    if (!v) return;

    store.doc = v.snapshot.doc;
    store.rawLeafletXml = v.snapshot.rawLeafletXml;
    store.fileInfo = v.snapshot.fileInfo;
    store.layoutByAreaId = v.snapshot.layoutByAreaId || {};
    store.status = v.snapshot.status || 'draft';
    store.commentsByOfferId = v.snapshot.commentsByOfferId || {};

    const userName = safeString(payload.user?.name) || 'Ukendt';
    addAudit(leafletId, { type: 'revert', message: `${userName} gendannede en version`, user: payload.user || null, details: { versionId } });
    io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });

    io.to(leafletId).emit('doc:sync', {
      leafletId,
      state: {
        doc: store.doc,
        rawLeafletXml: store.rawLeafletXml,
        fileInfo: store.fileInfo,
        layoutByAreaId: store.layoutByAreaId,
        status: store.status,
        commentsByOfferId: store.commentsByOfferId,
        versions: store.versions,
        audit: store.audit,
      },
    });
  });

  socket.on('disconnect', () => {
    for (const [leafletId, room] of presence.entries()) {
      if (room.has(socket.id)) {
        const user = room.get(socket.id);
        room.delete(socket.id);
        io.to(leafletId).emit('presence:list', { leafletId, users: getPresenceList(leafletId) });

        const store = ensureLeaflet(leafletId);
        addAudit(leafletId, {
          type: 'presence',
          message: `${safeString(user?.name) || 'Ukendt'} forlod sessionen`,
          user: { name: safeString(user?.name), email: safeString(user?.email), userId: safeString(user?.userId) },
        });
        io.to(leafletId).emit('audit:entry', { leafletId, entry: store.audit[0] });
      }
    }
  });
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[PEPen server] listening on http://localhost:${PORT} (client origin: ${CLIENT_ORIGIN})`);
});
