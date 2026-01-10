import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import FileUploader from './components/FileUploader';
import LeafletViewer from './components/LeafletViewer';
import Toolbar from './components/Toolbar';
import BottomBar from './components/BottomBar';
import { loadXMLPair } from './utils/xmlParser';
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
  const [fileInfo, setFileInfo] = useState(null);

  const [dirHandle, setDirHandle] = useState(null);
  const [folderEvents, setFolderEvents] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [folderStatus, setFolderStatus] = useState('');

  const viewerRootRef = useRef(null);

  const extractCampaignIdFromFilename = (filename) => {
    if (!filename) return null;
    const match = String(filename).match(/\bL\d{4,}\b/i);
    return match ? match[0].toUpperCase() : null;
  };

  const canPickDirectory = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

  const extractEventIdFromFilename = (filename) => {
    if (!filename) return null;
    const match = String(filename).match(/\bL\d{4,}\b/i);
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

  const handleLayoutChange = useCallback(({ areaId, nextLayout }) => {
    if (!areaId) return;
    if (!nextLayout || typeof nextLayout !== 'object') return;
    setLayoutByAreaId((prev) => ({
      ...(prev || {}),
      [areaId]: {
        order: Array.isArray(nextLayout.order) ? nextLayout.order : [],
        sizes: nextLayout.sizes && typeof nextLayout.sizes === 'object' ? nextLayout.sizes : {},
      },
    }));
  }, []);

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
  }, [currentPage, leafletData]);

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
  };

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
          />
        )}

        <div className="app-content" ref={viewerRootRef}>
          {!leafletData && !loading && (
            <FileUploader 
              onFilesUpload={handleFilesUpload}
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
        />
      </div>
    </ThemeProvider>
  );
}

export default App;
