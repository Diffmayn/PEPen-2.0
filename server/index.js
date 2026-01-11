const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

function nowIso() {
  return new Date().toISOString();
}

function safeString(s) {
  return String(s || '').trim();
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
      versions: [],
      audit: [],
    });
  }
  if (!presence.has(id)) presence.set(id, new Map());
  return leaflets.get(id);
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
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.get('/health', (req, res) => {
  res.json({ ok: true, at: nowIso() });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
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
