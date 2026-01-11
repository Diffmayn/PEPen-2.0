import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Divider,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

function toStringSafe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function kvRows(obj, { excludeKeys = [] } = {}) {
  if (!obj || typeof obj !== 'object') return [];
  const exclude = new Set(excludeKeys);
  return Object.keys(obj)
    .filter((k) => !exclude.has(k))
    .sort((a, b) => a.localeCompare(b))
    .map((k) => ({ key: k, value: obj[k] }));
}

function KeyValueTable({ title, obj, excludeKeys }) {
  const rows = useMemo(() => kvRows(obj, { excludeKeys }), [obj, excludeKeys]);
  if (!rows.length) return null;

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
        {title}
      </Typography>
      <Table size="small" sx={{ '& td': { verticalAlign: 'top' } }}>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell sx={{ width: 220, fontWeight: 600 }}>
                {r.key}
              </TableCell>
              <TableCell sx={{ wordBreak: 'break-word' }}>
                {Array.isArray(r.value) ? (
                  <Chip size="small" label={`Array(${r.value.length})`} />
                ) : typeof r.value === 'object' && r.value !== null ? (
                  <Chip size="small" label="Object" />
                ) : (
                  <Typography variant="body2">{toStringSafe(r.value)}</Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

function TechnicalPageView({ area, areaIndex, metadata, fileInfo }) {
  const fileLoadedLabel = useMemo(() => {
    if (!fileInfo) return '';
    const label = String(fileInfo.loadedLabel || '').trim();
    if (label) return label;
    return '';
  }, [fileInfo]);

  const blocks = area?.blocks || [];

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, mb: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }} noWrap>
            Teknisk visning · Side {Number(area?.pageNumber || areaIndex + 1)}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {metadata?.promotionEventName ? `Event: ${metadata.promotionEventName}` : 'Event: (ukendt)'}
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          {fileLoadedLabel ? (
            <Typography variant="caption" color="text.secondary">
              {fileLoadedLabel}
            </Typography>
          ) : null}
        </Box>
      </Box>

      <Divider sx={{ mb: 1.5 }} />

      {blocks.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          Ingen blocks på denne side.
        </Typography>
      ) : (
        blocks.map((block, idx) => {
          const offer = block?.offer || null;
          const title = offer
            ? `${offer.headline || offer.name || 'Offer'} · OfferID ${offer.id || '(ukendt)'}`
            : `Tom block · BlockID ${block.blockId || '(ukendt)'}`;

          return (
            <Accordion key={block.blockId || idx} defaultExpanded={idx === 0} disableGutters>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}
                sx={{
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 1,
                    minWidth: 0,
                  },
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }} noWrap>
                  {title}
                </Typography>
                {block?.priority ? <Chip size="small" label={`Priority ${block.priority}`} variant="outlined" /> : null}
                {offer?.purchasingGroupDescription ? (
                  <Chip size="small" label={offer.purchasingGroupDescription} variant="outlined" />
                ) : null}
              </AccordionSummary>
              <AccordionDetails>
                <KeyValueTable
                  title="Block"
                  obj={block}
                  excludeKeys={['offer']}
                />

                {offer ? (
                  <>
                    <KeyValueTable
                      title="Offer"
                      obj={offer}
                      excludeKeys={['boxes', 'images', 'products']}
                    />

                    {(() => {
                      const rows = [];
                      (offer.boxes || []).forEach((b) => {
                        const tplRows = b?.template?.templateRows;
                        if (Array.isArray(tplRows)) rows.push(...tplRows);
                      });
                      const filtered = rows.filter((r) => r && (r.propertyName || (Array.isArray(r.texts) && r.texts.length)));
                      if (!filtered.length) return null;
                      return (
                        <Box sx={{ mt: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                            ContentTemplate (rå)
                          </Typography>
                          <Table size="small" sx={{ '& td': { verticalAlign: 'top' } }}>
                            <TableBody>
                              {filtered.slice(0, 250).map((r, i) => (
                                <TableRow key={`${r.propertyName || 'row'}-${i}`}>
                                  <TableCell sx={{ width: 260, fontWeight: 600 }}>
                                    {r.propertyName || '(ingen PropertyName)'}
                                  </TableCell>
                                  <TableCell sx={{ wordBreak: 'break-word' }}>
                                    <Typography variant="body2">
                                      {(Array.isArray(r.texts) ? r.texts : [r.texts]).filter(Boolean).join(' | ')}
                                    </Typography>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      );
                    })()}

                    {Array.isArray(offer.images) && offer.images.length > 0 ? (
                      <KeyValueTable title="Images" obj={{ images: offer.images }} />
                    ) : null}

                    {Array.isArray(offer.products) && offer.products.length > 0 ? (
                      <KeyValueTable title="Products" obj={{ products: offer.products }} />
                    ) : null}

                    {Array.isArray(offer.boxes) && offer.boxes.length > 0 ? (
                      <KeyValueTable title="Boxes" obj={{ boxes: offer.boxes }} />
                    ) : null}
                  </>
                ) : null}
              </AccordionDetails>
            </Accordion>
          );
        })
      )}
    </Box>
  );
}

export default TechnicalPageView;
