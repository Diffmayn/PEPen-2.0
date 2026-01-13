import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import HTMLFlipBook from 'react-pageflip';
import html2canvas from 'html2canvas';
import PageThumbnails from './PageThumbnails';
import PageRenderer from './PageRenderer';
import TechnicalPageView from './TechnicalPageView';
import './LeafletViewer.css';

function LeafletViewer({ data, viewMode, currentPage, setCurrentPage, zoom, editMode, onOfferUpdate, exportAllPagesSignal, flipEnabled, isFullscreen, searchTerm, highlightPageIndex, technicalView, fileInfo, layoutByAreaId, onLayoutChange, commentsByOfferId, onOpenComments, offerFilter, focusedOfferId, scrollToPageRequest, proofingByOfferId, proofingEnabled }) {
  const [selectedOfferId, setSelectedOfferId] = useState(null);
  const [loadedPages, setLoadedPages] = useState(() => new Set([0]));
  const [thumbnails, setThumbnails] = useState(() => ({}));
  const pageRefs = useRef([]);
  const observerRef = useRef(null);
  const mainViewerRef = useRef(null);
  const flipBookRef = useRef(null);

  const areas = useMemo(() => data?.areas ?? [], [data]);
  const hasAreas = areas.length > 0;
  const totalPages = areas.length;
  const meta = data?.metadata || null;

  const handleOfferClick = (offer) => {
    if (!editMode) return;
    setSelectedOfferId(offer?.id ?? null);
  };

  useEffect(() => {
    const id = String(focusedOfferId || '').trim();
    if (!id) return;
    setSelectedOfferId(id);
  }, [focusedOfferId]);

  const scrollToPage = useCallback((index) => {
    if (flipEnabled) {
      // try to drive flipbook when enabled
      try {
        const api = flipBookRef.current?.pageFlip?.();
        if (api?.turnToPage) api.turnToPage(index);
        else if (api?.flip) api.flip(index);
      } catch (_) {
        // ignore
      }
    } else if (viewMode !== 'spread') {
      const target = pageRefs.current[index];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    setCurrentPage(index);
  }, [flipEnabled, setCurrentPage, viewMode]);

  useEffect(() => {
    if (!scrollToPageRequest) return;
    const index = scrollToPageRequest?.pageIndex;
    if (typeof index !== 'number' || Number.isNaN(index)) return;
    scrollToPage(index);
  }, [scrollToPageRequest?.nonce, scrollToPage, scrollToPageRequest]);

  const pageItemMinHeight = useMemo(() => {
    if (viewMode === 'mobile') return 667;
    if (viewMode === 'print') return 1120;
    return 1000;
  }, [viewMode]);

  useEffect(() => {
    if (areas.length === 0) return;

    // Always ensure the current page is marked as loaded
    setLoadedPages(prev => {
      if (prev.has(currentPage)) return prev;
      const next = new Set(prev);
      next.add(currentPage);
      return next;
    });
  }, [areas, currentPage]);

  useEffect(() => {
    if (areas.length === 0) return;
    if (!exportAllPagesSignal) return;

    setLoadedPages(new Set(Array.from({ length: areas.length }, (_, i) => i)));
  }, [exportAllPagesSignal, areas]);

  useEffect(() => {
    if (!flipEnabled) return;
    if (areas.length === 0) return;
    // Flipbook needs real content on pages to feel good.
    setLoadedPages(new Set(Array.from({ length: areas.length }, (_, i) => i)));
  }, [areas.length, flipEnabled]);

  const findPageRendererEl = useCallback((index) => {
    const root = mainViewerRef.current;
    if (!root) return null;
    const el = root.querySelector(`[data-index="${index}"] .page-renderer`);
    return el;
  }, []);

  const requestThumbnail = useCallback(async (index) => {
    if (thumbnails[index]) return;
    if (!mainViewerRef.current) return;

    setLoadedPages(prev => {
      if (prev.has(index)) return prev;
      const next = new Set(prev);
      next.add(index);
      return next;
    });

    // Give React time to render the page
    await new Promise(r => setTimeout(r, 60));

    const pageEl = findPageRendererEl(index);
    if (!pageEl) return;

    try {
      const canvas = await html2canvas(pageEl, {
        scale: 0.35,
        useCORS: true,
        backgroundColor: '#ffffff',
      });

      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      setThumbnails(prev => {
        if (prev[index]) return prev;
        return { ...prev, [index]: dataUrl };
      });
    } catch (_) {
      // ignore capture failures
    }
  }, [findPageRendererEl, thumbnails]);

  useEffect(() => {
    if (areas.length === 0) return;
    if (!mainViewerRef.current) return;
    if (flipEnabled) {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }
    if (viewMode === 'spread') {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      return;
    }

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }

    const rootEl = mainViewerRef.current;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Mark pages as loaded when they come close to viewport
        setLoadedPages(prev => {
          let changed = false;
          const next = new Set(prev);
          for (const entry of entries) {
            if (entry.isIntersecting) {
              const index = Number(entry.target.dataset.index);
              if (!Number.isNaN(index) && !next.has(index)) {
                next.add(index);
                changed = true;
              }
            }
          }
          return changed ? next : prev;
        });

        // Update current page based on highest visible ratio
        let bestIndex = null;
        let bestRatio = 0;
        for (const entry of entries) {
          const index = Number(entry.target.dataset.index);
          if (Number.isNaN(index)) continue;
          if (entry.isIntersecting && entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIndex = index;
          }
        }
        if (bestIndex !== null && bestRatio >= 0.35) {
          setCurrentPage(bestIndex);
        }
      },
      {
        root: rootEl,
        // Preload pages before they appear
        rootMargin: '800px 0px',
        threshold: [0, 0.15, 0.35, 0.6, 0.85]
      }
    );

    // Observe each page wrapper
    pageRefs.current.forEach((el) => {
      if (el) observerRef.current.observe(el);
    });

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [areas, flipEnabled, setCurrentPage, viewMode]);

  useEffect(() => {
    if (!flipEnabled) return;
    try {
      const api = flipBookRef.current?.pageFlip?.();
      if (!api) return;
      if (api.getCurrentPageIndex && api.getCurrentPageIndex() === currentPage) return;
      if (api.turnToPage) {
        api.turnToPage(currentPage);
      } else if (api.flip) {
        api.flip(currentPage);
      }
    } catch (_) {
      // ignore
    }
  }, [currentPage, flipEnabled]);

  const renderPageContent = (area, index) => {
    const isLoaded = loadedPages.has(index);
    if (!isLoaded) {
      return (
        <div
          className="page-placeholder"
          style={{ minHeight: pageItemMinHeight }}
          aria-label={`Indlæser side ${area.pageNumber}`}
        />
      );
    }

    if (technicalView) {
      return (
        <Paper sx={{ width: '100%', maxWidth: 980, mx: 'auto' }}>
          <TechnicalPageView
            area={area}
            areaIndex={index}
            metadata={meta}
            fileInfo={fileInfo}
          />
        </Paper>
      );
    }

    if (viewMode === 'mobile') {
      return (
        <Box sx={{ maxWidth: '375px', mx: 'auto' }}>
          <PageRenderer
            area={area}
            areaIndex={index}
            totalPages={totalPages}
            viewMode={viewMode}
            zoom={zoom}
            editMode={editMode}
            onOfferClick={handleOfferClick}
            selectedOfferId={selectedOfferId}
            onOfferUpdate={onOfferUpdate}
            metadata={meta}
            highlightTerm={searchTerm}
            highlightEnabled={index === highlightPageIndex}
            layout={area?.id ? layoutByAreaId?.[area.id] : null}
            onLayoutChange={onLayoutChange}
            offerFilter={offerFilter}
            proofingByOfferId={proofingByOfferId}
            proofingEnabled={proofingEnabled}
            mobile
          />
        </Box>
      );
    }

    if (viewMode === 'print') {
      return (
        <Paper sx={{ width: '210mm', minHeight: '297mm', p: 2, mx: 'auto' }}>
          <PageRenderer
            area={area}
            areaIndex={index}
            totalPages={totalPages}
            viewMode={viewMode}
            zoom={zoom}
            editMode={editMode}
            onOfferClick={handleOfferClick}
            selectedOfferId={selectedOfferId}
            onOfferUpdate={onOfferUpdate}
            highlightTerm={searchTerm}
            highlightEnabled={index === highlightPageIndex}
            layout={area?.id ? layoutByAreaId?.[area.id] : null}
            onLayoutChange={onLayoutChange}
            offerFilter={offerFilter}
            proofingByOfferId={proofingByOfferId}
            proofingEnabled={proofingEnabled}
          />
        </Paper>
      );
    }

    // Default: single page rendering
    return (
      <PageRenderer
        area={area}
        areaIndex={index}
        totalPages={totalPages}
        viewMode={viewMode}
        zoom={zoom}
        editMode={editMode}
        onOfferClick={handleOfferClick}
        selectedOfferId={selectedOfferId}
        onOfferUpdate={onOfferUpdate}
        metadata={meta}
        highlightTerm={searchTerm}
        highlightEnabled={index === highlightPageIndex}
        layout={area?.id ? layoutByAreaId?.[area.id] : null}
        onLayoutChange={onLayoutChange}
        commentsByOfferId={commentsByOfferId}
        onOpenComments={onOpenComments}
        offerFilter={offerFilter}
        proofingByOfferId={proofingByOfferId}
        proofingEnabled={proofingEnabled}
      />
    );
  };

  if (!hasAreas) {
    return (
      <Box className="empty-state">
        <Typography variant="h6" color="text.secondary">
          Ingen data at vise
        </Typography>
      </Box>
    );
  }

  return (
    <div className="leaflet-viewer">
      {!isFullscreen && (
        <PageThumbnails
          areas={areas}
          currentPage={currentPage}
          onPageSelect={scrollToPage}
          thumbnails={thumbnails}
          onRequestThumbnail={requestThumbnail}
        />
      )}

      <div className="main-viewer" ref={mainViewerRef}>
        <div className={flipEnabled ? 'viewer-container flip' : 'viewer-container scroll'} style={{ transform: `scale(${zoom / 100})` }}>
          {flipEnabled ? (
            <div className="flipbook-wrap">
              <HTMLFlipBook
                ref={flipBookRef}
                width={800}
                height={1000}
                size="stretch"
                minWidth={320}
                maxWidth={1200}
                minHeight={420}
                maxHeight={1500}
                maxShadowOpacity={0.35}
                showCover={false}
                mobileScrollSupport={true}
                onFlip={(e) => {
                  if (typeof e?.data === 'number') setCurrentPage(e.data);
                }}
              >
                {areas.map((area, index) => (
                  <div key={area.id || index} className="flip-page" data-index={index}>
                    {renderPageContent(area, index)}
                  </div>
                ))}
              </HTMLFlipBook>
            </div>
          ) : viewMode === 'spread' ? (
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
              {currentPage < areas.length && (
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {renderPageContent(areas[currentPage], currentPage)}
                </Box>
              )}
              {currentPage + 1 < areas.length && (
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  {renderPageContent(areas[currentPage + 1], currentPage + 1)}
                </Box>
              )}
            </Box>
          ) : (
            <div className="scroll-pages">
              {areas.map((area, index) => (
                <div
                  key={area.id || index}
                  className="scroll-page"
                  data-index={index}
                  ref={(el) => {
                    pageRefs.current[index] = el;
                  }}
                >
                  {renderPageContent(area, index)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeafletViewer;
