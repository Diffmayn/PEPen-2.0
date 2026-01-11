import React, { useCallback, useMemo, useState } from 'react';
import { Paper, Box, Typography, Chip } from '@mui/material';
import OfferCard from './OfferCard';
import './PageRenderer.css';

function formatAreaSubtitle(name) {
  const v = String(name || '').trim();
  if (!v) return '';
  const parts = v.split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1).join(' · ');
  return v;
}

function formatValidityLabel(meta) {
  const from = String(meta?.validFrom || '').trim();
  const to = String(meta?.validTo || '').trim();
  if (!from && !to) return '';
  const fmt = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s;
    return `${m[3]}.${m[2]}.${m[1]}`;
  };
  if (from && to) return `Gælder ${fmt(from)}-${fmt(to)}`;
  if (from) return `Gælder fra ${fmt(from)}`;
  return '';
}

function PlaceholderCard({ label = 'Tom plads' }) {
  return (
    <Box className="offer-placeholder" aria-label={label}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function stableBlockKey(block, blockIndex) {
  const id = String(block?.blockId || '').trim();
  return id ? id : `idx-${blockIndex}`;
}

function PageRenderer({ area, areaIndex, zoom, editMode, onOfferClick, selectedOfferId, onOfferUpdate, metadata, highlightTerm, highlightEnabled = false, mobile = false, layout, onLayoutChange, commentsByOfferId, onOpenComments, offerFilter, proofingByOfferId, proofingEnabled }) {
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  const blocks = useMemo(
    () => ((area?.blocks || []).map((block, blockIndex) => ({ block, blockIndex, key: stableBlockKey(block, blockIndex) }))),
    [area]
  );

  const offerCount = useMemo(
    () => blocks.filter(({ block }) => !!block.offer).length,
    [blocks]
  );

  const gridCols = useMemo(() => {
    if (mobile) return 1;
    const n = blocks.length;
    if (n <= 4) return 2;
    if (n <= 9) return 3;
    return 4;
  }, [blocks.length, mobile]);

  const orderedBlocks = useMemo(() => {
    const order = Array.isArray(layout?.order) ? layout.order : null;
    if (!order || order.length === 0) return blocks;

    const byKey = new Map(blocks.map((b) => [b.key, b]));
    const seen = new Set();
    const out = [];
    for (const k of order) {
      if (!byKey.has(k)) continue;
      out.push(byKey.get(k));
      seen.add(k);
    }
    for (const b of blocks) {
      if (!seen.has(b.key)) out.push(b);
    }
    return out;
  }, [blocks, layout?.order]);

  const sizeForKey = useCallback((key) => {
    const v = layout?.sizes?.[key];
    if (v === 'full' || v === 'half' || v === 'standard') return v;
    return 'standard';
  }, [layout?.sizes]);

  const spanForSize = useCallback((size) => {
    if (mobile) return 1;
    if (size === 'full') return gridCols;
    if (size === 'half') return Math.max(1, Math.ceil(gridCols / 2));
    return 1;
  }, [gridCols, mobile]);

  const emitLayout = useCallback((next) => {
    if (!area?.id) return;
    if (typeof onLayoutChange !== 'function') return;
    onLayoutChange({ areaId: area.id, nextLayout: next });
  }, [area?.id, onLayoutChange]);

  const handleDropOnKey = useCallback((dropKey) => {
    if (!editMode) return;
    if (!dragKey || !dropKey || dragKey === dropKey) return;
    const currentOrder = orderedBlocks.map((b) => b.key);
    const fromIdx = currentOrder.indexOf(dragKey);
    const toIdx = currentOrder.indexOf(dropKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const nextOrder = currentOrder.slice();
    nextOrder.splice(fromIdx, 1);
    nextOrder.splice(toIdx, 0, dragKey);

    emitLayout({
      order: nextOrder,
      sizes: layout?.sizes || {},
    });
  }, [dragKey, editMode, emitLayout, layout?.sizes, orderedBlocks]);

  const handleSetSize = useCallback((key, size) => {
    if (!editMode) return;
    const nextSizes = { ...(layout?.sizes || {}) };
    nextSizes[key] = size;
    emitLayout({
      order: (Array.isArray(layout?.order) && layout.order.length) ? layout.order : orderedBlocks.map((b) => b.key),
      sizes: nextSizes,
    });
  }, [editMode, emitLayout, layout?.order, layout?.sizes, orderedBlocks]);

  if (!area) {
    return (
      <Paper className="page-renderer empty">
        <Typography color="text.secondary">Ingen side data</Typography>
      </Paper>
    );
  }

  return (
    <Paper className={`page-renderer ${mobile ? 'mobile' : ''}`}>
      <Box className="page-header">
        <Box className="page-header-left">
          <Box className="page-brand">
            <Box className="brand-mark" aria-label="Bilka style" sx={{ bgcolor: 'primary.main' }} />
            <Typography variant="subtitle2" className="brand-title" color="primary">
              {metadata?.promotionEventName || 'Leaflet'}
            </Typography>
          </Box>
          <Typography variant="h6" component="h2" className="page-title">
            {area.name}
          </Typography>
          {formatAreaSubtitle(area.name) ? (
            <Typography variant="caption" className="page-subtitle">
              {formatAreaSubtitle(area.name)}
            </Typography>
          ) : null}
        </Box>

        <Box className="page-header-right">
          <Typography variant="caption" className="validity">
            {formatValidityLabel(metadata)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
            <Chip label={`Side ${area.pageNumber}`} size="small" color="primary" />
            <Chip label={`${offerCount} tilbud`} size="small" variant="outlined" />
          </Box>
        </Box>
      </Box>

      <Box className="page-content">
        {blocks.length === 0 ? (
          <Box className="empty-page">
            <Typography variant="body2" color="text.secondary">
              Ingen tilbud på denne side
            </Typography>
          </Box>
        ) : (
          <Box className="offers-grid" style={{ '--offer-cols': gridCols }}>
            {orderedBlocks.map(({ block, blockIndex, key }, index) => {
              const size = sizeForKey(key);
              const span = spanForSize(size);
              const isOver = overKey && overKey === key;

              const matchesFilter =
                !block.offer || typeof offerFilter !== 'function' ? true : !!offerFilter(block.offer);

              return (
                <div
                  key={key}
                  className={`offer-slot ${editMode ? 'editable' : ''} ${isOver ? 'drag-over' : ''}`}
                  style={{ gridColumn: `span ${span}` }}
                  draggable={!!editMode}
                  onDragStart={(e) => {
                    if (!editMode) return;
                    setDragKey(key);
                    try {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', key);
                    } catch (_) {
                      // ignore
                    }
                  }}
                  onDragEnd={() => {
                    setDragKey(null);
                    setOverKey(null);
                  }}
                  onDragOver={(e) => {
                    if (!editMode) return;
                    e.preventDefault();
                    setOverKey(key);
                    try {
                      e.dataTransfer.dropEffect = 'move';
                    } catch (_) {
                      // ignore
                    }
                  }}
                  onDragLeave={() => {
                    if (overKey === key) setOverKey(null);
                  }}
                  onDrop={(e) => {
                    if (!editMode) return;
                    e.preventDefault();
                    const incoming = e.dataTransfer?.getData?.('text/plain') || dragKey;
                    if (incoming) setDragKey(incoming);
                    handleDropOnKey(key);
                    setOverKey(null);
                    setDragKey(null);
                  }}
                >
                  {block.offer ? (
                    matchesFilter ? (
                    <OfferCard
                      offer={block.offer}
                      blockId={block.blockId}
                      editMode={editMode}
                      onClick={() => onOfferClick(block.offer)}
                      isSelected={selectedOfferId && String(selectedOfferId) === String(block.offer.id)}
                      areaIndex={areaIndex}
                      blockIndex={blockIndex}
                      onOfferUpdate={onOfferUpdate}
                      highlightTerm={highlightEnabled ? highlightTerm : ''}
                      proofingEnabled={!!proofingEnabled}
                      proofing={
                        proofingByOfferId && block.offer?.id
                          ? proofingByOfferId[String(block.offer.id).trim()]
                          : null
                      }
                      layoutSize={size}
                      onSetLayoutSize={(nextSize) => handleSetSize(key, nextSize)}
                      commentCount={
                        block.offer?.id && commentsByOfferId && Array.isArray(commentsByOfferId[String(block.offer.id)])
                          ? commentsByOfferId[String(block.offer.id)].length
                          : 0
                      }
                      onOpenComments={onOpenComments}
                    />
                    ) : (
                      <PlaceholderCard label="Skjult af filter" />
                    )
                  ) : (
                    <PlaceholderCard />
                  )}
                </div>
              );
            })}
          </Box>
        )}
      </Box>

      <Box className="page-footer">
        <Typography variant="caption" color="text.secondary">
          {area.templateName}
        </Typography>
      </Box>
    </Paper>
  );
}

export default PageRenderer;
