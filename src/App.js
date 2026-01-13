import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { Box, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Snackbar, Alert } from '@mui/material';
import FileUploader from './components/FileUploader';
import LeafletViewer from './components/LeafletViewer';
import Toolbar from './components/Toolbar';
import BottomBar from './components/BottomBar';
import CommentsDrawer from './components/CommentsDrawer';
import VersionsDrawer from './components/VersionsDrawer';
import { loadXMLPair } from './utils/xmlParser';
import { connectSocket, getOrCreateClientId, isCollabEnabled, loadUser, saveUser } from './utils/collab';
import { getDanishSpellchecker, findMisspellingsSync, buildContextPreview } from './utils/spellcheck';
import './App.css';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const theme = createTheme({
  palette: {
    primary: {
      main: '#003366',
    },
    secondary: {
      main: '#CC0000',
    },
  },
  typography: {
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: 13,
  },
  components: {
    MuiTypography: {
      styleOverrides: {
        root: {
          lineHeight: 1.25,
        },
      },
    },
    MuiButton: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiIconButton: {
      defaultProps: {
        size: 'small',
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
        margin: 'dense',
      },
    },
    MuiFormControl: {
      defaultProps: {
        margin: 'dense',
        size: 'small',
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          fontSize: 12,
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        input: {
          fontSize: 12,
          paddingTop: 6,
          paddingBottom: 6,
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        input: {
          fontSize: 12,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: 12,
          minHeight: 32,
        },
      },
    },
  },
});

function parseDateYmd(s) {
  const v = String(s || '').trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDkDateRange(validFrom, validTo) {
  const from = parseDateYmd(validFrom);
  const to = parseDateYmd(validTo);
  const fmt = (d) => {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yy = String(d.getFullYear());
    return `${dd}.${mm}.${yy}`;
  };
  if (from && to) return `Gælder ${fmt(from)}-${fmt(to)}`;
  if (from) return `Gælder fra ${fmt(from)}`;
  return '';
}

function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
}

function App() {
  const [leafletData, setLeafletData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('single'); // single, spread, mobile, print
  const [currentPage, setCurrentPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [editMode, setEditMode] = useState(false);
  const [technicalView, setTechnicalView] = useState(false);
  const [layoutByAreaId, setLayoutByAreaId] = useState({});
  const [exportAllPagesSignal, setExportAllPagesSignal] = useState(0);
  const [campaignId, setCampaignId] = useState(null);
  const [rawLeafletXml, setRawLeafletXml] = useState(null);
  const [flipEnabled, setFlipEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [proofingEnabled, setProofingEnabled] = useState(true);
  const [spellchecker, setSpellchecker] = useState(null);
  const [spellcheckerError, setSpellcheckerError] = useState(null);
  const [offerIdFilter, setOfferIdFilter] = useState('');
  const [purchasingGroupFilter, setPurchasingGroupFilter] = useState('');
  const [focusedOfferId, setFocusedOfferId] = useState('');
  const [scrollToPageRequest, setScrollToPageRequest] = useState(null);
  const [fileInfo, setFileInfo] = useState(null);

  const collabEnvOverride = useMemo(() => {
    const raw = String(process.env.REACT_APP_COLLAB || '').trim().toLowerCase();
    if (!raw) return null;
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return null;
  }, []);

  const [collabEnabledLocal, setCollabEnabledLocal] = useState(() => {
    try {
      return isCollabEnabled();
    } catch (_) {
      return false;
    }
  });

  const collabEnabled = collabEnvOverride !== null ? collabEnvOverride : collabEnabledLocal;

  const toggleCollabEnabled = useCallback(
    (nextEnabled) => {
      if (collabEnvOverride !== null) return;
      try {
        localStorage.setItem('pepen.collab.enabled', nextEnabled ? '1' : '0');
      } catch (_) {
        // ignore
      }
      setCollabEnabledLocal(!!nextEnabled);
      if (!nextEnabled) {
        setVersionsOpen(false);
        setCommentsOpen(false);
      }
    },
    [collabEnvOverride]
  );
  const clientId = useMemo(() => getOrCreateClientId(), []);
  const socketRef = useRef(null);
  const [collabConnected, setCollabConnected] = useState(false);
  const [collabUsers, setCollabUsers] = useState([]);

  const [user, setUser] = useState(() => loadUser());
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [draftUserName, setDraftUserName] = useState('');
  const [draftUserEmail, setDraftUserEmail] = useState('');

  const [leafletStatus, setLeafletStatus] = useState('draft');
  const [commentsByOfferId, setCommentsByOfferId] = useState({});
  const [versions, setVersions] = useState([]);
  const [audit, setAudit] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notificationsUnread, setNotificationsUnread] = useState(0);
  const [mentionsInbox, setMentionsInbox] = useState([]);
  const [mentionsUnread, setMentionsUnread] = useState(0);
  const [toast, setToast] = useState(null);

  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsInitialTab, setVersionsInitialTab] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentsContext, setCommentsContext] = useState(null);

  const [dirtySinceLastVersion, setDirtySinceLastVersion] = useState(false);

  const currentPageRef = useRef(currentPage);
  const dirtySinceLastVersionRef = useRef(dirtySinceLastVersion);

  const [dirHandle, setDirHandle] = useState(null);
  const [folderEvents, setFolderEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [folderStatus, setFolderStatus] = useState('');

  const viewerRootRef = useRef(null);

  const extractCampaignIdFromFilename = (filename) => {
    if (!filename) return null;
    const match = String(filename).match(/\b[LA]\d{4,}\b/i);
    return match ? match[0].toUpperCase() : null;
  };

  const canPickDirectory = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

  const extractEventIdFromFilename = (filename) => {
    if (!filename) return null;
    const match = String(filename).match(/\b[LA]\d{4,}\b/i);
    return match ? match[0].toUpperCase() : null;
  };

  const classifyXmlFilename = (filename) => {
    const s = String(filename || '').toLowerCase();
    if (s.includes('ipr')) return 'ipr';
    if (s.includes('leaflet')) return 'leaflet';
    return 'unknown';
  };

  const scanDirectoryForEvents = useCallback(async (handle) => {
    if (!handle) return [];
    const groups = new Map();

    const isNewer = (newMs, oldMs) => {
      if (newMs == null && oldMs == null) return false;
      if (newMs == null && oldMs != null) return false;
      if (newMs != null && oldMs == null) return true;
      return newMs > oldMs;
    };

    const walk = async (dirHandle) => {
      // eslint-disable-next-line no-restricted-syntax
      for await (const [name, entry] of dirHandle.entries()) {
        if (!entry) continue;

        if (entry.kind === 'directory') {
          await walk(entry);
          continue;
        }

        if (entry.kind !== 'file') continue;
        if (!String(name).toLowerCase().endsWith('.xml')) continue;

        const eventId = extractEventIdFromFilename(name);
        if (!eventId) continue;

        const kind = classifyXmlFilename(name);
        if (!groups.has(eventId)) {
          groups.set(eventId, {
            eventId,
            ipr: null,
            leaflet: null,
            iprName: '',
            leafletName: '',
            iprMs: null,
            leafletMs: null,
          });
        }
        const g = groups.get(eventId);

        const tsMs = extractFileTimestampMs(name);

        if (kind === 'ipr') {
          if (!g.ipr || isNewer(tsMs, g.iprMs)) {
            g.ipr = entry;
            g.iprName = name;
            g.iprMs = tsMs;
          }
        } else if (kind === 'leaflet') {
          if (!g.leaflet || isNewer(tsMs, g.leafletMs)) {
            g.leaflet = entry;
            g.leafletName = name;
            g.leafletMs = tsMs;
          }
        }
      }
    };

    await walk(handle);

    const out = Array.from(groups.values()).map((g) => {
      const iprTs = extractFileTimestampLabel(g.iprName);
      const leafletTs = extractFileTimestampLabel(g.leafletName);
      const tsLabel = iprTs && leafletTs && iprTs !== leafletTs
        ? `${iprTs} / ${leafletTs}`
        : (iprTs || leafletTs || '');

      const hasPair = !!(g.ipr && g.leaflet);
      const label = tsLabel
        ? `${g.eventId} (${tsLabel})${hasPair ? '' : ' ⚠ mangler par'}`
        : `${g.eventId}${hasPair ? '' : ' ⚠ mangler par'}`;

      return {
        eventId: g.eventId,
        label,
        hasPair,
        iprHandle: g.ipr,
        leafletHandle: g.leaflet,
        iprName: g.iprName,
        leafletName: g.leafletName,
      };
    });

    out.sort((a, b) => a.eventId.localeCompare(b.eventId));
    return out;
  }, []);

  const extractFileTimestampLabel = (filename) => {
    if (!filename) return '';
    const s = String(filename);
    const m = s.match(/(\d{4}-\d{2}-\d{2})\s(\d{2})_(\d{2})_(\d{2})/);
    if (!m) return '';
    const ymd = m[1];
    const hh = m[2];
    const mm = m[3];
    const ss = m[4];
    return `${ymd} kl. ${hh}:${mm}:${ss}`;
  };

  const extractFileTimestampMs = (filename) => {
    if (!filename) return null;
    const s = String(filename);
    const m = s.match(/(\d{4})-(\d{2})-(\d{2})\s(\d{2})_(\d{2})_(\d{2})/);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const d = new Date(year, month - 1, day, hour, minute, second);
    const ms = d.getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const normalizedSearchTerm = useMemo(() => String(searchTerm || '').trim().toLowerCase(), [searchTerm]);

  useEffect(() => {
    let cancelled = false;
    getDanishSpellchecker()
      .then((sp) => {
        if (cancelled) return;
        setSpellchecker(sp);
        setSpellcheckerError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setSpellchecker(null);
        setSpellcheckerError(String(err?.message || err || 'Kunne ikke indlæse stavekontrol'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const offerAndGroupIndex = useMemo(() => {
    const offerById = new Map();
    const groupByKey = new Map();

    const areas = leafletData?.areas || [];
    areas.forEach((area, pageIndex) => {
      (area?.blocks || []).forEach((block) => {
        const offer = block?.offer;
        if (!offer) return;

        const offerId = String(offer.id || '').trim();
        if (offerId && !offerById.has(offerId)) {
          const headline = String(offer.headline || offer.name || '').trim();
          offerById.set(offerId, {
            id: offerId,
            pageIndex,
            headline,
            label: headline ? `${offerId} · ${headline}` : offerId,
          });
        }

        const groupDesc = String(offer.purchasingGroupDescription || '').trim();
        const groupCode = String(offer.purchasingGroup || '').trim();
        const groupKey = groupDesc || groupCode;
        if (groupKey) {
          const existing = groupByKey.get(groupKey);
          if (!existing) {
            groupByKey.set(groupKey, {
              key: groupKey,
              label: groupKey,
              pageIndex,
              count: 1,
            });
          } else {
            existing.count += 1;
          }
        }
      });
    });

    const offerOptions = Array.from(offerById.values()).sort((a, b) => a.id.localeCompare(b.id));
    const groupOptions = Array.from(groupByKey.values())
      .map((g) => ({ ...g, label: g.count ? `${g.label} (${g.count})` : g.label }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      offerById,
      groupByKey,
      offerOptions,
      groupOptions,
    };
  }, [leafletData]);

  const proofing = useMemo(() => {
    if (!leafletData) return { byOfferId: {}, issues: [] };
    if (!proofingEnabled) return { byOfferId: {}, issues: [] };
    if (!spellchecker) return { byOfferId: {}, issues: [] };

    const byOfferId = {};
    const issues = [];

    const areas = leafletData?.areas || [];
    areas.forEach((area, pageIndex) => {
      (area?.blocks || []).forEach((block) => {
        const offer = block?.offer;
        if (!offer) return;

        const offerId = String(offer.id || '').trim();
        if (!offerId) return;

        const fields = [
          { key: 'headline', label: 'Headline', text: offer.headline || offer.name || '' },
          { key: 'bodyText', label: 'Body text', text: offer.bodyText || '' },
          { key: 'salesCondition', label: 'Betingelse', text: offer.salesCondition || '' },
          { key: 'salesText', label: 'Badge', text: offer.salesText || '' },
        ];

        fields.forEach((f) => {
          const text = String(f.text || '');
          if (!text.trim()) return;

          const raw = findMisspellingsSync(spellchecker, text);
          const mistakes = raw.filter((m) => !/^[A-ZÆØÅ]{2,}$/.test(String(m.word || '')));
          if (!mistakes.length) return;

          byOfferId[offerId] = byOfferId[offerId] || {};
          byOfferId[offerId][f.key] = mistakes;

          mistakes.forEach((m) => {
            issues.push({
              offerId,
              pageIndex,
              field: f.label,
              word: m.word,
              preview: buildContextPreview(text, m),
            });
          });
        });
      });
    });

    return { byOfferId, issues };
  }, [leafletData, proofingEnabled, spellchecker]);

  const offerFilterFn = useMemo(() => {
    const id = String(offerIdFilter || '').trim();
    const groupKey = String(purchasingGroupFilter || '').trim();
    if (!id && !groupKey) return null;
    if (id) {
      return (offer) => String(offer?.id || '').trim() === id;
    }
    return (offer) => {
      const desc = String(offer?.purchasingGroupDescription || '').trim();
      const code = String(offer?.purchasingGroup || '').trim();
      return desc === groupKey || code === groupKey;
    };
  }, [offerIdFilter, purchasingGroupFilter]);

  const requestScrollToPage = useCallback((pageIndex) => {
    if (typeof pageIndex !== 'number' || Number.isNaN(pageIndex)) return;
    setScrollToPageRequest({ pageIndex, nonce: Date.now() });
  }, []);

  const handleSelectOfferId = useCallback((nextOfferId) => {
    const id = String(nextOfferId || '').trim();
    setOfferIdFilter(id);
    setPurchasingGroupFilter('');
    setFocusedOfferId(id);
    if (!id) return;
    const hit = offerAndGroupIndex.offerById.get(id);
    if (hit && typeof hit.pageIndex === 'number') requestScrollToPage(hit.pageIndex);
  }, [offerAndGroupIndex.offerById, requestScrollToPage]);

  const handleSelectPurchasingGroup = useCallback((nextGroupKey) => {
    const key = String(nextGroupKey || '').trim();
    setPurchasingGroupFilter(key);
    setOfferIdFilter('');
    setFocusedOfferId('');
    if (!key) return;
    const hit = offerAndGroupIndex.groupByKey.get(key);
    if (hit && typeof hit.pageIndex === 'number') requestScrollToPage(hit.pageIndex);
  }, [offerAndGroupIndex.groupByKey, requestScrollToPage]);

  const handleSelectProofingIssue = useCallback((issue) => {
    const offerId = String(issue?.offerId || '').trim();
    const pageIndex = issue?.pageIndex;
    if (!offerId) return;
    setFocusedOfferId(offerId);
    if (typeof pageIndex === 'number' && !Number.isNaN(pageIndex)) requestScrollToPage(pageIndex);
  }, [requestScrollToPage]);

  const brandMeta = leafletData?.metadata || null;
  const validityLabel = useMemo(
    () => formatDkDateRange(brandMeta?.validFrom, brandMeta?.validTo),
    [brandMeta?.validFrom, brandMeta?.validTo]
  );
  const weekLabel = useMemo(() => {
    const d = parseDateYmd(brandMeta?.validFrom);
    if (!d) return '';
    const w = getIsoWeek(d);
    return `Uge ${String(w).padStart(2, '0')}`;
  }, [brandMeta?.validFrom]);

  const searchResults = useMemo(() => {
    if (!leafletData || !normalizedSearchTerm) return [];
    const results = [];

    leafletData.areas.forEach((area, pageIndex) => {
      (area.blocks || []).forEach((block) => {
        const offer = block.offer;
        if (!offer) return;

        const fields = [
          ['Headline', offer.headline || offer.name || ''],
          ['Body', offer.bodyText || ''],
          ['Pris', offer.price || ''],
        ];

        for (const [field, value] of fields) {
          const v = String(value || '');
          if (v.toLowerCase().includes(normalizedSearchTerm)) {
            const idx = v.toLowerCase().indexOf(normalizedSearchTerm);
            const start = Math.max(0, idx - 25);
            const end = Math.min(v.length, idx + normalizedSearchTerm.length + 25);
            const preview = v.slice(start, end);
            results.push({
              pageIndex,
              offerId: offer.id,
              field,
              preview,
            });
            break;
          }
        }
      });
    });

    return results;
  }, [leafletData, normalizedSearchTerm]);

  const totalPages = leafletData?.areas?.length || 0;

  const layoutStorageKey = useMemo(() => {
    const id = campaignId || leafletData?.metadata?.promotionEventName || 'unknown';
    return `pepen.layout.${String(id)}`;
  }, [campaignId, leafletData?.metadata?.promotionEventName]);

  const leafletId = useMemo(() => {
    return String(campaignId || leafletData?.metadata?.promotionEventName || 'unknown');
  }, [campaignId, leafletData?.metadata?.promotionEventName]);

  const commentsStorageKey = useMemo(() => `pepen.comments.${leafletId}`, [leafletId]);
  const statusStorageKey = useMemo(() => `pepen.status.${leafletId}`, [leafletId]);

  const leafletIdRef = useRef(leafletId);
  const leafletDataRef = useRef(leafletData);
  const rawLeafletXmlRef = useRef(rawLeafletXml);
  const fileInfoRef = useRef(fileInfo);
  const layoutByAreaIdRef = useRef(layoutByAreaId);
  const userRef = useRef(user);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    dirtySinceLastVersionRef.current = dirtySinceLastVersion;
  }, [dirtySinceLastVersion]);

  useEffect(() => {
    leafletIdRef.current = leafletId;
  }, [leafletId]);
  useEffect(() => {
    leafletDataRef.current = leafletData;
  }, [leafletData]);
  useEffect(() => {
    rawLeafletXmlRef.current = rawLeafletXml;
  }, [rawLeafletXml]);
  useEffect(() => {
    fileInfoRef.current = fileInfo;
  }, [fileInfo]);
  useEffect(() => {
    layoutByAreaIdRef.current = layoutByAreaId;
  }, [layoutByAreaId]);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!leafletData) return;
    try {
      const raw = localStorage.getItem(layoutStorageKey);
      if (!raw) {
        setLayoutByAreaId({});
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        setLayoutByAreaId({});
        return;
      }
      setLayoutByAreaId(parsed);
    } catch (_) {
      setLayoutByAreaId({});
    }
  }, [leafletData, layoutStorageKey]);

  useEffect(() => {
    if (!leafletData) return;
    try {
      localStorage.setItem(layoutStorageKey, JSON.stringify(layoutByAreaId || {}));
    } catch (_) {
      // ignore
    }
  }, [layoutByAreaId, leafletData, layoutStorageKey]);

  useEffect(() => {
    if (!collabEnabled) return;
    if (user) return;
    setDraftUserName('');
    setDraftUserEmail('');
    setUserDialogOpen(true);
  }, [collabEnabled, user]);

  useEffect(() => {
    if (!leafletData) return;
    if (collabConnected) return;
    try {
      const rawStatus = localStorage.getItem(statusStorageKey);
      if (rawStatus) setLeafletStatus(String(rawStatus));
    } catch (_) {
      // ignore
    }
    try {
      const rawComments = localStorage.getItem(commentsStorageKey);
      if (rawComments) {
        const parsed = JSON.parse(rawComments);
        if (parsed && typeof parsed === 'object') setCommentsByOfferId(parsed);
      }
    } catch (_) {
      // ignore
    }
  }, [collabConnected, commentsStorageKey, leafletData, statusStorageKey]);

  useEffect(() => {
    if (!leafletData) return;
    if (collabConnected) return;
    try {
      localStorage.setItem(statusStorageKey, String(leafletStatus || 'draft'));
    } catch (_) {
      // ignore
    }
  }, [collabConnected, leafletData, leafletStatus, statusStorageKey]);

  useEffect(() => {
    if (!leafletData) return;
    if (collabConnected) return;
    try {
      localStorage.setItem(commentsStorageKey, JSON.stringify(commentsByOfferId || {}));
    } catch (_) {
      // ignore
    }
  }, [collabConnected, commentsByOfferId, commentsStorageKey, leafletData]);

  useEffect(() => {
    if (!collabEnabled) return;
    if (!user) return;

    const socket = connectSocket();
    socketRef.current = socket;

    const onConnect = () => setCollabConnected(true);
    const onDisconnect = () => setCollabConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('presence:list', (payload) => {
      if (!payload) return;
      if (String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      setCollabUsers(Array.isArray(payload.users) ? payload.users : []);
    });

    socket.on('doc:sync', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      const state = payload.state || {};
      if (state.doc) setLeafletData(state.doc);
      if (state.rawLeafletXml != null) setRawLeafletXml(state.rawLeafletXml);
      if (state.fileInfo != null) setFileInfo(state.fileInfo);
      if (state.layoutByAreaId) setLayoutByAreaId(state.layoutByAreaId);
      if (state.status) setLeafletStatus(state.status);
      if (state.commentsByOfferId) setCommentsByOfferId(state.commentsByOfferId);
      if (Array.isArray(state.versions)) setVersions(state.versions);
      if (Array.isArray(state.audit)) setAudit(state.audit);
      setDirtySinceLastVersion(false);
    });

    socket.on('doc:missing', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      if (!leafletDataRef.current) return;
      socket.emit('doc:set', {
        leafletId: leafletIdRef.current,
        doc: leafletDataRef.current,
        rawLeafletXml: rawLeafletXmlRef.current,
        fileInfo: fileInfoRef.current,
        layoutByAreaId: layoutByAreaIdRef.current,
        user: userRef.current,
      });
    });

    socket.on('offer:update', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      if (payload.clientId && payload.clientId === clientId) return;
      const { areaIndex, blockIndex, changes } = payload;
      if (!changes || typeof changes !== 'object') return;

      setLeafletData((prev) => {
        if (!prev || !Array.isArray(prev.areas)) return prev;
        if (areaIndex < 0 || areaIndex >= prev.areas.length) return prev;
        const nextAreas = prev.areas.map((area, idx) => {
          if (idx !== areaIndex) return area;
          if (!area || !Array.isArray(area.blocks)) return area;
          if (blockIndex < 0 || blockIndex >= area.blocks.length) return area;
          const nextBlocks = area.blocks.map((block, bIdx) => {
            if (bIdx !== blockIndex) return block;
            if (!block || !block.offer) return block;
            return { ...block, offer: { ...block.offer, ...changes } };
          });
          return { ...area, blocks: nextBlocks };
        });
        return { ...prev, areas: nextAreas };
      });
    });

    socket.on('layout:update', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      if (payload.clientId && payload.clientId === clientId) return;
      const { areaId, nextLayout } = payload;
      if (!areaId) return;
      setLayoutByAreaId((prev) => {
        const next = { ...(prev || {}) };
        if (nextLayout == null) {
          delete next[areaId];
        } else {
          next[areaId] = nextLayout;
        }
        return next;
      });
    });

    socket.on('status:set', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      if (payload.clientId && payload.clientId === clientId) return;
      setLeafletStatus(payload.status || 'draft');
      setToast({ severity: 'info', message: `Status blev ændret til ${payload.status}` });
    });

    socket.on('comment:add', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      if (payload.clientId && payload.clientId === clientId) return;
      const c = payload.comment;
      if (!c || !c.offerId) return;
      setCommentsByOfferId((prev) => {
        const next = { ...(prev || {}) };
        const key = String(c.offerId);
        const list = Array.isArray(next[key]) ? next[key].slice(0) : [];
        list.push(c);
        next[key] = list;
        return next;
      });
    });

    socket.on('versions:list', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
    });

    socket.on('audit:entry', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      const entry = payload.entry;
      if (!entry) return;
      setAudit((prev) => [entry, ...(prev || [])]);
      setNotifications((prev) => [entry, ...(prev || [])].slice(0, 50));
      setNotificationsUnread((n) => n + 1);
    });

    socket.on('mentions:list', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      setMentionsInbox(items.slice(0, 200));
    });

    socket.on('mention:new', (payload) => {
      if (!payload || String(payload.leafletId || '') !== String(leafletIdRef.current || '')) return;
      const entry = payload.entry;
      if (!entry) return;
      setMentionsInbox((prev) => [entry, ...(prev || [])].slice(0, 200));
      setMentionsUnread((n) => n + 1);
      const from = entry.fromUser?.name ? entry.fromUser.name : 'en kollega';
      const where = entry.offerTitle ? ` på "${entry.offerTitle}"` : '';
      setToast({ severity: 'info', message: `Du blev tagget af ${from}${where}.` });
    });

    return () => {
      try {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.disconnect();
      } catch (_) {
        // ignore
      }
      socketRef.current = null;
      setCollabConnected(false);
      setCollabUsers([]);
    };
  }, [clientId, collabEnabled, user]);

  useEffect(() => {
    if (!collabEnabled) return;
    if (!collabConnected) return;
    if (!user) return;
    if (!leafletId) return;

    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('room:join', { leafletId, user, pageIndex: currentPageRef.current });
  }, [collabConnected, collabEnabled, leafletId, user]);

  useEffect(() => {
    if (!collabEnabled) return;
    if (!collabConnected) return;
    if (!user) return;
    if (!leafletId) return;

    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('presence:update', { leafletId, user, pageIndex: currentPage });
  }, [collabConnected, collabEnabled, currentPage, leafletId, user]);

  useEffect(() => {
    if (!collabEnabled) return;
    if (!collabConnected) return;
    const id = setInterval(() => {
      if (!dirtySinceLastVersionRef.current) return;
      const socket = socketRef.current;
      if (!socket) return;
      if (!leafletIdRef.current) return;
      if (!userRef.current) return;
      socket.emit('version:save', { leafletId: leafletIdRef.current, summary: 'Autosave', user: userRef.current });
      setDirtySinceLastVersion(false);
    }, 30000);

    return () => clearInterval(id);
  }, [collabConnected, collabEnabled]);

  const handleLayoutChange = useCallback(
    ({ areaId, nextLayout }) => {
      if (!areaId) return;
      if (!nextLayout || typeof nextLayout !== 'object') return;

      const sanitizePrinciple = (p) => {
        if (!p || typeof p !== 'object') return null;
        const id = String(p.id || '').trim();
        if (!id) return null;
        // Keep it simple: only allow #1-#5 + variant letter.
        if (!/^([1-5])[a-z]$/i.test(id)) return null;
        return { id: id.toLowerCase() };
      };

      const sanitized = {
        order: Array.isArray(nextLayout.order) ? nextLayout.order : [],
        sizes: nextLayout.sizes && typeof nextLayout.sizes === 'object' ? nextLayout.sizes : {},
        principle: sanitizePrinciple(nextLayout.principle),
      };

      setLayoutByAreaId((prev) => ({
        ...(prev || {}),
        [areaId]: sanitized,
      }));

      setDirtySinceLastVersion(true);

      const socket = socketRef.current;
      if (collabEnabled && collabConnected && socket) {
        socket.emit('layout:update', {
          leafletId: leafletIdRef.current,
          areaId,
          nextLayout: sanitized,
          clientId,
          user: userRef.current,
        });
      }
    },
    [clientId, collabConnected, collabEnabled]
  );

  const resetLayoutForCurrentPage = useCallback(() => {
    if (!leafletData?.areas?.length) return;
    const area = leafletData.areas[currentPage];
    const areaId = area?.id;
    if (!areaId) return;
    setLayoutByAreaId((prev) => {
      if (!prev || !prev[areaId]) return prev;
      const next = { ...prev };
      delete next[areaId];
      return next;
    });

    setDirtySinceLastVersion(true);

    const socket = socketRef.current;
    if (collabEnabled && collabConnected && socket) {
      socket.emit('layout:update', {
        leafletId: leafletIdRef.current,
        areaId,
        nextLayout: null,
        clientId,
        user: userRef.current,
      });
    }
  }, [clientId, collabConnected, collabEnabled, currentPage, leafletData]);

  const goToPage = useCallback((index) => {
    if (!totalPages) return;
    const safe = Math.max(0, Math.min(totalPages - 1, index));
    setCurrentPage(safe);
  }, [totalPages]);

  const goPrev = useCallback(() => goToPage(currentPage - 1), [currentPage, goToPage]);
  const goNext = useCallback(() => goToPage(currentPage + 1), [currentPage, goToPage]);

  const toggleFullscreen = async () => {
    if (!viewerRootRef.current) return;

    try {
      if (!document.fullscreenElement) {
        await viewerRootRef.current.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  useEffect(() => {
    if (!leafletData) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }

      if (e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goNext();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [leafletData, goNext, goPrev]);

  const handleOfferUpdate = ({ areaIndex, blockIndex, changes }) => {
    if (!changes || typeof changes !== 'object') return;

    setLeafletData(prev => {
      if (!prev || !Array.isArray(prev.areas)) return prev;
      if (areaIndex < 0 || areaIndex >= prev.areas.length) return prev;

      const nextAreas = prev.areas.map((area, idx) => {
        if (idx !== areaIndex) return area;
        if (!area || !Array.isArray(area.blocks)) return area;
        if (blockIndex < 0 || blockIndex >= area.blocks.length) return area;

        const nextBlocks = area.blocks.map((block, bIdx) => {
          if (bIdx !== blockIndex) return block;
          if (!block || !block.offer) return block;
          return {
            ...block,
            offer: {
              ...block.offer,
              ...changes,
            },
          };
        });

        return {
          ...area,
          blocks: nextBlocks,
        };
      });

      return {
        ...prev,
        areas: nextAreas,
      };
    });

    setDirtySinceLastVersion(true);

    const socket = socketRef.current;
    if (collabEnabled && collabConnected && socket) {
      socket.emit('offer:update', {
        leafletId: leafletIdRef.current,
        areaIndex,
        blockIndex,
        changes,
        clientId,
        user: userRef.current,
      });
    }
  };

  const onSetLeafletStatus = useCallback(
    (next) => {
      const status = String(next || 'draft');
      setLeafletStatus(status);
      setDirtySinceLastVersion(true);

      const socket = socketRef.current;
      if (collabEnabled && collabConnected && socket) {
        socket.emit('status:set', {
          leafletId: leafletIdRef.current,
          status,
          clientId,
          user: userRef.current,
        });
      }
    },
    [clientId, collabConnected, collabEnabled]
  );

  const onMarkNotificationsRead = useCallback(() => {
    setNotificationsUnread(0);
  }, []);

  const onOpenVersions = useCallback(() => {
    setVersionsInitialTab(0);
    setVersionsOpen(true);
  }, []);

  const onOpenMentions = useCallback(() => {
    setVersionsInitialTab(2);
    setVersionsOpen(true);
  }, []);

  const onOpenComments = useCallback((ctx) => {
    if (!ctx || !ctx.offerId) return;
    setCommentsContext(ctx);
    setCommentsOpen(true);
  }, []);

  const currentCommentsOffer = useMemo(() => {
    const ctx = commentsContext;
    if (!ctx || !leafletData) return null;
    const area = leafletData?.areas?.[ctx.areaIndex];
    const block = area?.blocks?.[ctx.blockIndex];
    return block?.offer || null;
  }, [commentsContext, leafletData]);

  const currentCommentsList = useMemo(() => {
    const offerId = commentsContext?.offerId;
    if (!offerId) return [];
    return commentsByOfferId?.[String(offerId)] || [];
  }, [commentsByOfferId, commentsContext?.offerId]);

  const onAddComment = useCallback(
    (offerId, textOrPayload, pageIndex) => {
      const id = String(offerId || '').trim();
      const payload = typeof textOrPayload === 'object' && textOrPayload
        ? textOrPayload
        : { text: textOrPayload };
      const t = String(payload.text || '').trim();
      if (!id || !t) return;

      const mentions = Array.isArray(payload.mentions) ? payload.mentions : [];
      const offerTitle = String(payload.offerTitle || '').trim();

      const localComment = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        at: new Date().toISOString(),
        offerId: id,
        pageIndex: typeof pageIndex === 'number' ? pageIndex : null,
        user: userRef.current,
        text: t,
        mentions,
        offerTitle: offerTitle || null,
      };

      setCommentsByOfferId((prev) => {
        const next = { ...(prev || {}) };
        const list = Array.isArray(next[id]) ? next[id].slice(0) : [];
        list.push(localComment);
        next[id] = list;
        return next;
      });

      setDirtySinceLastVersion(true);

      const socket = socketRef.current;
      if (collabEnabled && collabConnected && socket) {
        socket.emit('comment:add', {
          leafletId: leafletIdRef.current,
          offerId: id,
          text: t,
          pageIndex: typeof pageIndex === 'number' ? pageIndex : null,
          offerTitle: offerTitle || null,
          mentions,
          clientId,
          user: userRef.current,
        });
      }

      if (mentions && mentions.length) {
        // POC: simulate notification confirmation for the author.
        // eslint-disable-next-line no-console
        console.log('[mentions] notify', { offerId: id, mentions, offerTitle });
        const display = mentions.slice(0, 3).map((e) => `@${e}`).join(', ');
        setToast({ severity: 'success', message: `Notifieret: ${display}${mentions.length > 3 ? '…' : ''}` });
      }
    },
    [clientId, collabConnected, collabEnabled]
  );

  const onMarkMentionsRead = useCallback(() => {
    setMentionsUnread(0);
  }, []);

  const onSaveVersionNow = useCallback(() => {
    const socket = socketRef.current;
    if (!collabEnabled || !collabConnected || !socket) return;
    socket.emit('version:save', { leafletId: leafletIdRef.current, summary: 'Manuel gem', user: userRef.current });
    setDirtySinceLastVersion(false);
  }, [collabConnected, collabEnabled]);

  const onRevertVersion = useCallback(
    (versionId) => {
      const socket = socketRef.current;
      if (!collabEnabled || !collabConnected || !socket) return;
      socket.emit('version:revert', { leafletId: leafletIdRef.current, versionId, user: userRef.current });
      setDirtySinceLastVersion(false);
    },
    [collabConnected, collabEnabled]
  );

  const downloadJson = (filename, data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  const downloadTextFile = (filename, text, mimeType) => {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  };

  const buildOfferEditsMap = (data) => {
    const map = new Map();
    const areas = data?.areas || [];
    for (const area of areas) {
      const blocks = area?.blocks || [];
      for (const block of blocks) {
        const offer = block?.offer;
        if (!offer?.id) continue;
        map.set(String(offer.id), {
          headline: offer.headline ?? '',
          bodyText: offer.bodyText ?? '',
          price: offer.price ?? '',
        });
      }
    }
    return map;
  };

  const exportUpdatedLeafletXml = (leafletXmlText, data) => {
    if (!leafletXmlText) {
      throw new Error('Mangler original Leaflet XML (upload filerne igen).');
    }

    const editsByOfferId = buildOfferEditsMap(data);
    const parser = new DOMParser();
    const doc = parser.parseFromString(leafletXmlText, 'application/xml');
    const parseError = doc.getElementsByTagName('parsererror')[0];
    if (parseError) {
      throw new Error('Kunne ikke parse Leaflet XML til eksport.');
    }

    const offers = Array.from(doc.getElementsByTagNameNS('*', 'Offer'));

    const getFirstChildByLocalName = (parent, localName) => {
      if (!parent) return null;
      const nodes = parent.getElementsByTagNameNS('*', localName);
      return nodes && nodes.length > 0 ? nodes[0] : null;
    };

    const getDirectChildByLocalName = (parent, localName) => {
      if (!parent) return null;
      for (const child of Array.from(parent.childNodes)) {
        if (child.nodeType === 1 && child.localName === localName) return child;
      }
      return null;
    };

    const ensureDirectChildText = (parent, localName, value) => {
      if (!parent) return;
      let child = getDirectChildByLocalName(parent, localName);
      if (!child) {
        const ns = parent.namespaceURI;
        const prefix = parent.prefix;
        const qName = prefix ? `${prefix}:${localName}` : localName;
        child = doc.createElementNS(ns, qName);
        parent.appendChild(child);
      }
      child.textContent = value;
    };

    for (const offerEl of offers) {
      const idEl = getFirstChildByLocalName(offerEl, 'ID');
      const offerId = idEl ? String(idEl.textContent || '').trim() : '';
      if (!offerId) continue;

      const edits = editsByOfferId.get(offerId);
      if (!edits) continue;

      // Update ContentTemplate boxes (PropertyName/Text)
      const templateBoxes = Array.from(offerEl.getElementsByTagNameNS('*', 'Box'))
        .filter(boxEl => !!getDirectChildByLocalName(boxEl, 'PropertyName') && (getDirectChildByLocalName(boxEl, 'Text') || true));

      for (const boxEl of templateBoxes) {
        const propEl = getDirectChildByLocalName(boxEl, 'PropertyName');
        if (!propEl) continue;
        const propName = String(propEl.textContent || '');

        if (propName.includes('Headline') || propName.includes('headline')) {
          ensureDirectChildText(boxEl, 'Text', String(edits.headline ?? ''));
        } else if (propName.includes('Body') || propName.includes('body')) {
          ensureDirectChildText(boxEl, 'Text', String(edits.bodyText ?? ''));
        } else if (propName.includes('Price') || propName.includes('price')) {
          ensureDirectChildText(boxEl, 'Text', String(edits.price ?? ''));
        }
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const waitForImages = async (rootEl, timeoutMs = 7000) => {
    if (!rootEl) return;
    const imgs = Array.from(rootEl.querySelectorAll('img'));
    if (imgs.length === 0) return;

    const start = Date.now();

    await Promise.race([
      Promise.all(
        imgs.map(img => new Promise(resolve => {
          if (img.complete) return resolve();
          const cleanup = () => {
            img.removeEventListener('load', cleanup);
            img.removeEventListener('error', cleanup);
            resolve();
          };
          img.addEventListener('load', cleanup);
          img.addEventListener('error', cleanup);
        }))
      ),
      (async () => {
        while (Date.now() - start < timeoutMs) {
          const allDone = imgs.every(i => i.complete);
          if (allDone) return;
          await sleep(100);
        }
      })(),
    ]);
  };

  const getPdfPageSizePt = (pdf) => {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    return { pageWidth, pageHeight };
  };

  const addCanvasAsPdfPages = (pdf, canvas) => {
    const imgData = canvas.toDataURL('image/png');
    const { pageWidth, pageHeight } = getPdfPageSizePt(pdf);
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let y = 0;
    let remaining = imgHeight;

    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, y, imgWidth, imgHeight);
      addPdfWatermark(pdf);
      remaining -= pageHeight;
      if (remaining > 0) {
        pdf.addPage();
        y -= pageHeight;
      }
    }
  };

  const addPdfWatermark = (pdf) => {
    try {
      const { pageWidth, pageHeight } = getPdfPageSizePt(pdf);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(22);
      // Light Bilka-blue watermark
      pdf.setTextColor(170, 195, 220);
      pdf.text('Bilka Kladde – Intern Proof', pageWidth / 2, pageHeight / 2, {
        align: 'center',
        angle: 25,
      });
      pdf.setTextColor(0, 0, 0);
    } catch (_) {
      // ignore
    }
  };

  const addElementAsSinglePdfPage = async (pdf, el, isFirstPage) => {
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const { pageWidth, pageHeight } = getPdfPageSizePt(pdf);

    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    if (!isFirstPage) pdf.addPage();

    // Fit image within A4 page bounds
    const scale = Math.min(pageHeight / imgHeight, 1);
    const drawHeight = imgHeight * scale;
    const drawWidth = imgWidth * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    pdf.addImage(imgData, 'PNG', x, y, drawWidth, drawHeight);
    addPdfWatermark(pdf);
  };

  const handleFilesUpload = async (files) => {
    if (files.length !== 2) {
      setError('Please upload exactly 2 XML files (IPR and Leaflet)');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Determine which file is IPR and which is Leaflet
      let iprFile = null;
      let leafletFile = null;

      files.forEach(file => {
        if (file.name.toLowerCase().includes('ipr')) {
          iprFile = file;
        } else if (file.name.toLowerCase().includes('leaflet')) {
          leafletFile = file;
        }
      });

      if (!iprFile || !leafletFile) {
        iprFile = files[0];
        leafletFile = files[1];
      }

      await loadPair(iprFile, leafletFile);
    } catch (err) {
      setError(`Failed to load files: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadPair = useCallback(async (iprFile, leafletFile) => {
    if (!iprFile || !leafletFile) {
      setError('Mangler IPR- eller Leaflet-fil');
      return;
    }

    const detectedCampaignId =
      extractCampaignIdFromFilename(iprFile?.name) ||
      extractCampaignIdFromFilename(leafletFile?.name);
    setCampaignId(detectedCampaignId);

    const iprTs = extractFileTimestampLabel(iprFile?.name);
    const leafletTs = extractFileTimestampLabel(leafletFile?.name);
    const loadedLabel = iprTs && leafletTs && iprTs !== leafletTs
      ? `Filer indlæst: IPR ${iprTs} · Leaflet ${leafletTs}`
      : (iprTs || leafletTs ? `Filer indlæst: ${iprTs || leafletTs}` : '');
    setFileInfo({
      iprName: iprFile?.name || '',
      leafletName: leafletFile?.name || '',
      loadedLabel,
    });

    const result = await loadXMLPair(iprFile, leafletFile);

    if (result.success) {
      setLeafletData(result.data);
      setCurrentPage(0);
      setRawLeafletXml(result.raw?.leafletText ?? null);
      setTechnicalView(false);
      setEditMode(false);
      setLayoutByAreaId({});
      setError(null);
    } else {
      setError(result.error);
    }
  }, []);

  const loadBundledEventA0626052 = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const eventId = 'A0626052';
      const fromWindow =
        typeof window !== 'undefined'
          ? window.__PEPEN_BUNDLED_XML__?.events?.[eventId]
          : null;

      let iprText = fromWindow?.iprText ? String(fromWindow.iprText) : '';
      let leafletText = fromWindow?.leafletText ? String(fromWindow.leafletText) : '';

      const publicBase = String(process.env.PUBLIC_URL || '');
      const withPublicBase = (p) => (publicBase ? `${publicBase}${p}` : p);

      const injectedBase = typeof window !== 'undefined'
        ? String(window.__PEPEN_SAMPLE_BASE_URL__ || '')
        : '';

      const defaultRawBase = 'https://raw.githubusercontent.com/Diffmayn/PEPen-2.0/main/public/sample-xml';
      const normalizeBase = (b) => String(b || '').replace(/\/+$/, '');
      const sampleBaseCandidates = [normalizeBase(injectedBase), defaultRawBase].filter(Boolean);

      const looksLikeRootTag = (xmlText, rootTag) => {
        const t = String(xmlText || '').trim();
        if (!t) return false;
        if (!t.startsWith('<')) return false;
        const re = new RegExp(`<\\s*(?:\\w+:)?${rootTag}\\b`, 'i');
        return re.test(t);
      };

      const fetchText = async (url, rootTag) => {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} ved hentning af ${url}`);
        const txt = await res.text();
        if (rootTag && !looksLikeRootTag(txt, rootTag)) {
          throw new Error(`Ugyldigt XML-indhold fra ${url}`);
        }
        return txt;
      };

      const fetchFirstOk = async (urls, rootTag) => {
        let lastErr = null;
        for (const url of urls) {
          if (!url) continue;
          try {
            return await fetchText(url, rootTag);
          } catch (e) {
            lastErr = e;
          }
        }
        throw lastErr || new Error('Kunne ikke hente demo XML');
      };

      if (!iprText) {
        iprText = await fetchFirstOk([
          withPublicBase('/sample-xml/PMR_A0626052_IPR.xml'),
          ...sampleBaseCandidates.map((b) => `${b}/PMR_A0626052_IPR.xml`),
        ], 'ImageProductionRequest');
      }
      if (!leafletText) {
        leafletText = await fetchFirstOk([
          withPublicBase('/sample-xml/PMR_A0626052_Leaflet.xml'),
          ...sampleBaseCandidates.map((b) => `${b}/PMR_A0626052_Leaflet.xml`),
        ], 'LeafletRequest');
      }

      const iprFile = new File([iprText], 'PMR_A0626052_IPR.xml', { type: 'application/xml' });
      const leafletFile = new File([leafletText], 'PMR_A0626052_Leaflet.xml', { type: 'application/xml' });
      await loadPair(iprFile, leafletFile);
    } catch (e) {
      setError(`Kunne ikke indlæse demo A0626052: ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [loadPair]);

  const pickDirectory = useCallback(async () => {
    if (!canPickDirectory) {
      setFolderStatus('Mappe-indlæsning understøttes ikke i denne browser.');
      return;
    }
    try {
      setFolderStatus('Vælg en mappe...');
      const handle = await window.showDirectoryPicker();
      setDirHandle(handle);
      setFolderStatus('Scanner XML-filer...');
      const events = await scanDirectoryForEvents(handle);
      setFolderEvents(events);
      const firstPair = events.find((e) => e.hasPair);
      setSelectedEventId(firstPair?.eventId || events[0]?.eventId || '');
      const missing = events.filter((e) => !e.hasPair).length;
      setFolderStatus(
        events.length
          ? `${events.length} event(s) fundet${missing ? ` · ${missing} mangler par` : ''}`
          : 'Ingen events fundet'
      );
    } catch (e) {
      setFolderStatus('Annulleret eller ingen adgang til mappen.');
    }
  }, [canPickDirectory, scanDirectoryForEvents]);

  const refreshDirectory = useCallback(async () => {
    if (!dirHandle) return;
    try {
      setFolderStatus('Opdaterer liste...');
      const events = await scanDirectoryForEvents(dirHandle);
      setFolderEvents(events);
      if (selectedEventId && events.some((e) => e.eventId === selectedEventId)) {
        // keep selection
      } else {
        const firstPair = events.find((e) => e.hasPair);
        setSelectedEventId(firstPair?.eventId || events[0]?.eventId || '');
      }
      const missing = events.filter((e) => !e.hasPair).length;
      setFolderStatus(
        events.length
          ? `${events.length} event(s) fundet${missing ? ` · ${missing} mangler par` : ''}`
          : 'Ingen events fundet'
      );
    } catch (_) {
      setFolderStatus('Kunne ikke opdatere listen.');
    }
  }, [dirHandle, scanDirectoryForEvents, selectedEventId]);

  const loadSelectedEvent = useCallback(async () => {
    if (!selectedEventId) return;
    const ev = (folderEvents || []).find((e) => e.eventId === selectedEventId);
    if (!ev) return;
    if (!ev.hasPair) {
      setError(`Event ${selectedEventId} mangler IPR eller Leaflet i mappen.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const iprFile = await ev.iprHandle.getFile();
      const leafletFile = await ev.leafletHandle.getFile();
      await loadPair(iprFile, leafletFile);
    } catch (e) {
      setError(`Kunne ikke indlæse filer fra mappen: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [folderEvents, loadPair, selectedEventId]);

  const handleExportPDF = async (mode) => {
    if (!leafletData) return;

    const exportMode = mode === 'scroll' ? 'scroll' : 'pages';
    const previousViewMode = viewMode;

    try {
      // Spread mode doesn't render all pages; switch temporarily.
      if (previousViewMode === 'spread') {
        setViewMode('single');
        await sleep(50);
      }

      // Force lazy-loaded pages to render.
      setExportAllPagesSignal(prev => prev + 1);
      await sleep(150);

      const rootForWait = document.querySelector('.leaflet-viewer');
      await waitForImages(rootForWait);

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: 'a4',
      });

      if (exportMode === 'pages') {
        const pageEls = Array.from(document.querySelectorAll('.scroll-page .page-renderer'));
        if (pageEls.length === 0) {
          throw new Error('Kunne ikke finde sider at eksportere.');
        }

        for (let i = 0; i < pageEls.length; i++) {
          // eslint-disable-next-line no-await-in-loop
          await waitForImages(pageEls[i]);
          // eslint-disable-next-line no-await-in-loop
          await addElementAsSinglePdfPage(pdf, pageEls[i], i === 0);
        }
      } else {
        const scrollEl = document.querySelector('.scroll-pages');
        if (!scrollEl) {
          throw new Error('Kunne ikke finde scroll-visningen at eksportere.');
        }

        await waitForImages(scrollEl);
        const canvas = await html2canvas(scrollEl, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          scrollY: 0,
          scrollX: 0,
        });
        addCanvasAsPdfPages(pdf, canvas);
      }

      const safeCampaign = campaignId ? campaignId : 'UNKNOWN';
      const filename = exportMode === 'pages'
        ? `PEPen-2.0-${safeCampaign}-leaflet-pages.pdf`
        : `PEPen-2.0-${safeCampaign}-leaflet-scroll.pdf`;

      pdf.save(filename);
    } catch (err) {
      alert(`PDF eksport fejlede: ${err.message}`);
    } finally {
      if (previousViewMode === 'spread') {
        setViewMode(previousViewMode);
      }
    }
  };

  const handleSaveChanges = (mode) => {
    if (!leafletData) return;
    const saveMode = mode === 'leaflet-xml' ? 'leaflet-xml' : 'json';
    const safeCampaign = campaignId ? campaignId : 'UNKNOWN';

    if (saveMode === 'json') {
      downloadJson(`PEPen-2.0-${safeCampaign}-changes.json`, leafletData);
      return;
    }

    try {
      const updatedXml = exportUpdatedLeafletXml(rawLeafletXml, leafletData);
      downloadTextFile(`PEPen-2.0-${safeCampaign}-Leaflet-updated.xml`, updatedXml, 'application/xml');
    } catch (err) {
      alert(`Leaflet XML eksport fejlede: ${err.message}`);
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <div className="App">
        {!isFullscreen && (
          <Toolbar
            onExportPDF={handleExportPDF}
            onSaveChanges={handleSaveChanges}
            editMode={editMode}
            setEditMode={setEditMode}
            hasData={!!leafletData}
            technicalView={technicalView}
            setTechnicalView={setTechnicalView}
            onResetLayout={resetLayoutForCurrentPage}
            collabEnabled={collabEnabled}
            collabToggleDisabled={collabEnvOverride !== null}
            onToggleCollabEnabled={toggleCollabEnabled}
            collabConnected={collabConnected}
            collabUsers={collabUsers}
            leafletStatus={leafletStatus}
            onSetLeafletStatus={onSetLeafletStatus}
            notifications={notifications}
            notificationsUnread={notificationsUnread}
            onMarkNotificationsRead={onMarkNotificationsRead}
            onOpenVersions={onOpenVersions}
            mentionsUnread={mentionsUnread}
            onOpenMentions={onOpenMentions}
            proofingEnabled={proofingEnabled}
            setProofingEnabled={setProofingEnabled}
            proofingUnavailableReason={spellcheckerError}
            proofingIssueCount={proofing.issues.length}
            offerIdOptions={offerAndGroupIndex.offerOptions}
            selectedOfferId={offerIdFilter}
            onSelectOfferId={handleSelectOfferId}
            purchasingGroupOptions={offerAndGroupIndex.groupOptions}
            selectedPurchasingGroup={purchasingGroupFilter}
            onSelectPurchasingGroup={handleSelectPurchasingGroup}
          />
        )}

        <div className="app-content" ref={viewerRootRef}>
          {!leafletData && !loading && (
            <FileUploader 
              onFilesUpload={handleFilesUpload}
              onLoadBundledEventA0626052={loadBundledEventA0626052}
              error={error}
              canPickDirectory={canPickDirectory}
              onPickDirectory={pickDirectory}
              folderEvents={folderEvents}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              onLoadSelectedEvent={loadSelectedEvent}
              onRefreshDirectory={refreshDirectory}
              folderStatus={folderStatus}
            />
          )}

          {loading && (
            <div className="loading-container">
              <div className="loading-spinner"></div>
              <p>Indlæser og analyserer XML-filer...</p>
            </div>
          )}

          {leafletData && !loading && (
            <LeafletViewer
              data={leafletData}
              viewMode={viewMode}
              currentPage={currentPage}
              setCurrentPage={setCurrentPage}
              zoom={zoom}
              editMode={editMode}
              onOfferUpdate={handleOfferUpdate}
              exportAllPagesSignal={exportAllPagesSignal}
              flipEnabled={flipEnabled}
              isFullscreen={isFullscreen}
              searchTerm={normalizedSearchTerm}
              highlightPageIndex={currentPage}
              technicalView={technicalView}
              fileInfo={fileInfo}
              layoutByAreaId={layoutByAreaId}
              onLayoutChange={handleLayoutChange}
              commentsByOfferId={commentsByOfferId}
              onOpenComments={onOpenComments}
              offerFilter={offerFilterFn}
              focusedOfferId={focusedOfferId}
              scrollToPageRequest={scrollToPageRequest}
              proofingByOfferId={proofing.byOfferId}
              proofingEnabled={proofingEnabled}
            />
          )}
        </div>

        <BottomBar
          hasData={!!leafletData}
          brandLabel={[weekLabel, brandMeta?.promotionEventName].filter(Boolean).join(' · ')}
          validityLabel={validityLabel}
          currentPage={currentPage}
          totalPages={totalPages}
          onPrev={goPrev}
          onNext={goNext}
          onJumpTo={goToPage}
          zoom={zoom}
          setZoom={setZoom}
          viewMode={viewMode}
          setViewMode={setViewMode}
          flipEnabled={flipEnabled}
          setFlipEnabled={setFlipEnabled}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchResults={searchResults}
          onSelectSearchResult={(r) => goToPage(r.pageIndex)}
          proofingEnabled={proofingEnabled}
          proofingIssueCount={proofing.issues.length}
          proofingIssues={proofing.issues}
          onSelectProofingIssue={handleSelectProofingIssue}
        />

        <CommentsDrawer
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          offerTitle={currentCommentsOffer?.headline || currentCommentsOffer?.name || ''}
          offerId={commentsContext?.offerId}
          pageIndex={typeof commentsContext?.areaIndex === 'number' ? commentsContext.areaIndex : null}
          comments={currentCommentsList}
          onAddComment={onAddComment}
          currentUserEmail={user?.email || ''}
        />

        <VersionsDrawer
          open={versionsOpen}
          onClose={() => setVersionsOpen(false)}
          versions={versions}
          audit={audit}
          mentions={mentionsInbox}
          initialTab={versionsInitialTab}
          onMarkMentionsRead={onMarkMentionsRead}
          onSaveNow={onSaveVersionNow}
          onRevert={onRevertVersion}
        />

        <Dialog open={!!userDialogOpen} onClose={() => {}} maxWidth="xs" fullWidth>
          <DialogTitle>Vælg bruger</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
              <TextField
                label="Navn"
                value={draftUserName}
                onChange={(e) => setDraftUserName(e.target.value)}
                autoFocus
              />
              <TextField
                label="Email (valgfri)"
                value={draftUserEmail}
                onChange={(e) => setDraftUserEmail(e.target.value)}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              disabled={!String(draftUserName || '').trim()}
              onClick={() => {
                const next = saveUser({ name: draftUserName, email: draftUserEmail });
                setUser(next);
                setUserDialogOpen(false);
              }}
            >
              Fortsæt
            </Button>
          </DialogActions>
        </Dialog>

        <Snackbar
          open={!!toast}
          autoHideDuration={4000}
          onClose={() => setToast(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert onClose={() => setToast(null)} severity={toast?.severity || 'info'} sx={{ width: '100%' }}>
            {toast?.message || ''}
          </Alert>
        </Snackbar>
      </div>
    </ThemeProvider>
  );
}

export default App;
