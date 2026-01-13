import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardMedia, Typography, Box, Chip, IconButton, TextField, Menu, MenuItem, Tooltip, Badge } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import './OfferCard.css';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, term, keyPrefix = '') {
  const value = String(text || '');
  const t = String(term || '').trim();
  if (!t) return value;

  const re = new RegExp(escapeRegExp(t), 'ig');
  const parts = value.split(re);
  const matches = value.match(re);

  if (!matches) return value;

  const out = [];
  for (let i = 0; i < parts.length; i++) {
    out.push(parts[i]);
    if (i < matches.length) {
      out.push(
        <mark key={`${keyPrefix}${i}-${matches[i]}`} style={{ backgroundColor: '#fff59d' }}>
          {matches[i]}
        </mark>
      );
    }
  }
  return out;
}

function pushHighlightedSegment(out, segment, term, keyPrefix) {
  const highlighted = highlightText(segment, term, keyPrefix);
  if (Array.isArray(highlighted)) {
    highlighted.forEach((x) => out.push(x));
  } else {
    out.push(highlighted);
  }
}

function highlightWithProofing(text, term, misspellings, keyPrefix = '') {
  const value = String(text || '');
  const mistakes = Array.isArray(misspellings) ? misspellings : [];
  if (!mistakes.length) return highlightText(value, term, keyPrefix);

  const sorted = mistakes.slice().sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));
  const out = [];
  let cursor = 0;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];
    const idx = Number(m?.index);
    const len = Number(m?.length);
    if (!Number.isFinite(idx) || !Number.isFinite(len) || len <= 0) continue;
    if (idx < cursor) continue;
    if (idx >= value.length) continue;

    const before = value.slice(cursor, idx);
    if (before) pushHighlightedSegment(out, before, term, `${keyPrefix}b${i}-`);

    const word = value.slice(idx, Math.min(value.length, idx + len));
    out.push(
      <Box
        component="span"
        key={`${keyPrefix}spell-${i}-${idx}`}
        title="Mulig stavefejl"
        sx={{ textDecoration: 'underline', textDecorationStyle: 'wavy', textDecorationColor: 'error.main' }}
      >
        {highlightText(word, term, `${keyPrefix}w${i}-`)}
      </Box>
    );

    cursor = idx + len;
  }

  const after = value.slice(cursor);
  if (after) pushHighlightedSegment(out, after, term, `${keyPrefix}a-`);
  return out;
}

function OfferCard({ offer, blockId, blockPriority, editMode, onClick, isSelected, areaIndex, blockIndex, onOfferUpdate, highlightTerm, proofingEnabled = false, proofing = null, layoutSize = 'standard', onSetLayoutSize, commentCount = 0, onOpenComments }) {
  const [imageError, setImageError] = useState(false);
  const [primaryImageIndex, setPrimaryImageIndex] = useState(0);
  const [layoutMenuAnchor, setLayoutMenuAnchor] = useState(null);
  const [productsMenuAnchor, setProductsMenuAnchor] = useState(null);
  const [draftHeadline, setDraftHeadline] = useState(offer.headline || offer.name || '');
  const [draftBodyText, setDraftBodyText] = useState(offer.bodyText || '');
  const [draftPrice, setDraftPrice] = useState(offer.price || '');

  const badgeText = useMemo(() => String(offer.salesText || '').trim(), [offer.salesText]);
  const normalPriceText = useMemo(() => String(offer.normalPrice || '').trim(), [offer.normalPrice]);
  const buyQuantityText = useMemo(() => String(offer.buyQuantity || '').trim(), [offer.buyQuantity]);
  const salesConditionText = useMemo(() => String(offer.salesCondition || '').trim(), [offer.salesCondition]);
  const salesPriceText = useMemo(() => String(offer.salesPriceText || '').trim(), [offer.salesPriceText]);

  const isPriority3 = useMemo(() => {
    const v = String(blockPriority ?? '').trim();
    if (!v) return false;
    const m = v.match(/\d+/);
    const n = m ? Number.parseInt(m[0], 10) : Number.NaN;
    return Number.isFinite(n) ? n === 3 : v === '3';
  }, [blockPriority]);

  const quantityLabel = useMemo(() => {
    const qty = String(buyQuantityText || '').trim();
    const unit = String(salesPriceText || '').trim();
    if (!qty) return '';
    if (!unit) return '';
    return `${qty} ${unit}`.trim();
  }, [buyQuantityText, salesPriceText]);

  const imageUrls = useMemo(() => {
    const imgs = Array.isArray(offer?.images) ? offer.images : [];
    const urls = imgs
      .map((img) => String(img?.url || '').trim())
      .filter(Boolean);
    // Keep stable ordering but remove exact duplicates.
    return Array.from(new Set(urls));
  }, [offer?.images]);

  const primaryImage = imageUrls.length ? (imageUrls[primaryImageIndex] || imageUrls[0]) : null;

  const handleImageError = () => {
    if (primaryImageIndex < imageUrls.length - 1) {
      setPrimaryImageIndex((i) => i + 1);
      return;
    }
    setImageError(true);
  };

  useEffect(() => {
    if (!isSelected) return;
    setDraftHeadline(offer.headline || offer.name || '');
    setDraftBodyText(offer.bodyText || '');
    setDraftPrice(offer.price || '');
  }, [isSelected, offer.bodyText, offer.headline, offer.name, offer.price]);

  useEffect(() => {
    setImageError(false);
    setPrimaryImageIndex(0);
  }, [offer?.id, imageUrls.length]);

  const commitChanges = (changes) => {
    if (!editMode) return;
    if (!isSelected) return;
    if (typeof onOfferUpdate !== 'function') return;
    if (typeof areaIndex !== 'number' || typeof blockIndex !== 'number') return;
    onOfferUpdate({ areaIndex, blockIndex, changes });
  };

  const openLayoutMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setLayoutMenuAnchor(e.currentTarget);
  };

  const closeLayoutMenu = () => setLayoutMenuAnchor(null);

  const setSize = (size) => {
    closeLayoutMenu();
    if (typeof onSetLayoutSize === 'function') onSetLayoutSize(size);
  };

  const openProductsMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setProductsMenuAnchor(e.currentTarget);
  };

  const closeProductsMenu = () => setProductsMenuAnchor(null);

  return (
    <Card
      className={`offer-card ${isSelected ? 'selected' : ''} ${editMode ? 'editable' : ''}`}
      onClick={onClick}
      sx={{ cursor: editMode ? 'pointer' : 'default' }}
      data-blockid={blockId || undefined}
    >
      <Box className="offer-media" sx={{ position: 'relative' }}>
        {primaryImage && !imageError ? (
          <Tooltip
            title={
              <Box
                component="img"
                src={primaryImage}
                alt={offer.headline || 'Product image'}
                sx={{
                  maxWidth: '70vw',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  display: 'block',
                  bgcolor: 'background.paper',
                }}
              />
            }
            placement="right"
            arrow
            enterDelay={150}
            leaveDelay={0}
            disableInteractive={true}
          >
            <CardMedia
              component="img"
              height="200"
              image={primaryImage}
              alt={offer.headline || 'Product image'}
              onError={handleImageError}
              sx={{ objectFit: 'contain', bgcolor: 'action.hover', cursor: 'zoom-in' }}
            />
          </Tooltip>
        ) : (
          <Box
            sx={{
              height: 200,
              bgcolor: 'action.hover',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Intet billede
            </Typography>
          </Box>
        )}

        {imageUrls.length > 1 ? (
          <Box
            sx={{
              display: 'flex',
              gap: 1,
              overflowX: 'auto',
              px: 1,
              py: 0.75,
              bgcolor: 'background.paper',
              borderTop: 1,
              borderColor: 'divider',
            }}
          >
            {imageUrls.map((url, idx) => (
              <Tooltip
                key={`${url}-${idx}`}
                title={
                  <Box
                    component="img"
                    src={url}
                    alt={`Product image ${idx + 1}`}
                    sx={{
                      maxWidth: '60vw',
                      maxHeight: '60vh',
                      objectFit: 'contain',
                      display: 'block',
                      bgcolor: 'background.paper',
                    }}
                  />
                }
                placement="right"
                arrow
                enterDelay={150}
                leaveDelay={0}
                disableInteractive={true}
              >
                <Box
                  component="img"
                  src={url}
                  alt={`Product image ${idx + 1}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImageError(false);
                    setPrimaryImageIndex(idx);
                  }}
                  sx={{
                    height: 40,
                    width: 40,
                    objectFit: 'contain',
                    flex: '0 0 auto',
                    borderRadius: 0.5,
                    border: 1,
                    borderColor: idx === primaryImageIndex ? 'secondary.main' : 'divider',
                    bgcolor: 'action.hover',
                    cursor: 'pointer',
                  }}
                  loading="lazy"
                />
              </Tooltip>
            ))}
          </Box>
        ) : null}

        {badgeText ? (
          <Box className="offer-badge" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {highlightWithProofing(badgeText, highlightTerm, proofingEnabled ? proofing?.salesText : null, 'badge-')}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <CardContent>
        <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5 }}>
          <Tooltip title="Kommentarer">
            <IconButton
              size="small"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (typeof onOpenComments === 'function' && offer?.id) {
                  onOpenComments({ offerId: offer.id, areaIndex, blockIndex });
                }
              }}
              sx={{ bgcolor: 'background.paper' }}
            >
              <Badge color="secondary" badgeContent={commentCount} invisible={!commentCount}>
                <ChatBubbleOutlineIcon fontSize="small" />
              </Badge>
            </IconButton>
          </Tooltip>

          {editMode && (
            <>
            <Tooltip title="Layout (størrelse)">
              <IconButton
                size="small"
                onClick={openLayoutMenu}
                sx={{ bgcolor: 'background.paper' }}
              >
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" sx={{ bgcolor: 'background.paper' }}>
              <EditIcon fontSize="small" />
            </IconButton>

            <Menu
              anchorEl={layoutMenuAnchor}
              open={Boolean(layoutMenuAnchor)}
              onClose={closeLayoutMenu}
              onClick={(e) => e.stopPropagation()}
            >
              <MenuItem selected={layoutSize === 'standard'} onClick={() => setSize('standard')}>
                Standard
              </MenuItem>
              <MenuItem selected={layoutSize === 'half'} onClick={() => setSize('half')}>
                Halv bredde
              </MenuItem>
              <MenuItem selected={layoutSize === 'full'} onClick={() => setSize('full')}>
                Fuld bredde
              </MenuItem>
            </Menu>
            </>
          )}
        </Box>

        {editMode && isSelected ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }} onClick={(e) => e.stopPropagation()}>
            <TextField
              label="Headline"
              size="small"
              value={draftHeadline}
              onChange={(e) => setDraftHeadline(e.target.value)}
              onBlur={() => commitChanges({ headline: draftHeadline })}
              fullWidth
            />
            <TextField
              label="Body text"
              size="small"
              value={draftBodyText}
              onChange={(e) => setDraftBodyText(e.target.value)}
              onBlur={() => commitChanges({ bodyText: draftBodyText })}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="Pris"
              size="small"
              value={draftPrice}
              onChange={(e) => setDraftPrice(e.target.value)}
              onBlur={() => commitChanges({ price: draftPrice })}
              fullWidth
            />
          </Box>
        ) : (
          <>
            <Typography variant="h6" component="h3" gutterBottom className="offer-headline">
              {highlightWithProofing(
                offer.headline || offer.name || 'Uden titel',
                highlightTerm,
                proofingEnabled ? proofing?.headline : null,
                'headline-'
              )}
            </Typography>

            {offer.bodyText ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {highlightWithProofing(offer.bodyText, highlightTerm, proofingEnabled ? proofing?.bodyText : null, 'body-')}
              </Typography>
            ) : null}

            {(normalPriceText || offer.price) ? (
              <Box className="offer-priceBlock">
                {quantityLabel ? (
                  <Typography variant="subtitle2" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
                    {highlightText(quantityLabel, highlightTerm)}
                  </Typography>
                ) : null}
                {normalPriceText ? (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    className="offer-normalPrice"
                    sx={{ textDecoration: 'line-through' }}
                  >
                    {highlightText(normalPriceText, highlightTerm)}
                  </Typography>
                ) : null}
                {offer.price ? (
                  <Typography
                    variant="h4"
                    color={isPriority3 ? 'text.primary' : 'secondary'}
                    className="offer-price"
                    sx={{ fontWeight: isPriority3 ? 400 : 900, lineHeight: 1.05 }}
                  >
                    {highlightText(offer.price, highlightTerm)}
                  </Typography>
                ) : null}
                {(salesConditionText || (!quantityLabel && buyQuantityText)) ? (
                  <Typography variant="caption" color="text.secondary" className="offer-condition">
                    {salesConditionText
                      ? highlightWithProofing(salesConditionText, highlightTerm, proofingEnabled ? proofing?.salesCondition : null, 'cond-')
                      : (buyQuantityText ? highlightText(buyQuantityText, highlightTerm) : null)}
                  </Typography>
                ) : null}
              </Box>
            ) : null}
          </>
        )}

        {offer.logo ? (
          <Typography variant="caption" sx={{ display: 'block', mt: 1 }} color="text.secondary">
            Logo: {offer.logo}
          </Typography>
        ) : null}

        <Box sx={{ mt: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {offer.purchasingGroupDescription ? (
            <Chip label={offer.purchasingGroupDescription} size="small" variant="outlined" />
          ) : null}
          {badgeText ? (
            <Chip label={highlightWithProofing(badgeText, highlightTerm, proofingEnabled ? proofing?.salesText : null, 'chip-badge-')} size="small" color="secondary" sx={{ fontWeight: 700 }} />
          ) : null}
          {offer.products && offer.products.length > 0 ? (
            <Chip
              label={`${offer.products.length} produkt${offer.products.length > 1 ? 'er' : ''}`}
              size="small"
              color="secondary"
              variant="outlined"
              clickable
              onClick={openProductsMenu}
            />
          ) : null}
        </Box>

        <Menu
          anchorEl={productsMenuAnchor}
          open={Boolean(productsMenuAnchor)}
          onClose={closeProductsMenu}
          onClick={(e) => e.stopPropagation()}
          PaperProps={{ sx: { maxHeight: 420, width: 420 } }}
        >
          <MenuItem disabled>
            <Typography variant="caption" color="text.secondary">
              Produkter ({Array.isArray(offer?.products) ? offer.products.length : 0})
            </Typography>
          </MenuItem>
          {(offer?.products || []).slice(0, 100).map((p, idx) => {
            const number = String(p?.productNumber || '').trim();
            const name = String(p?.description || '').trim();
            const primary = [number, name].filter(Boolean).join(' · ') || `Produkt ${idx + 1}`;
            const secondary = String(p?.bodyText || '').trim();
            return (
              <MenuItem
                key={`${number}-${name}-${idx}`}
                onClick={() => {
                  closeProductsMenu();
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="body2">{primary}</Typography>
                  {secondary ? (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {secondary}
                    </Typography>
                  ) : null}
                </Box>
              </MenuItem>
            );
          })}
          {offer?.products && offer.products.length > 100 && (
            <MenuItem disabled>
              <Typography variant="caption">Viser de første 100 produkter</Typography>
            </MenuItem>
          )}
        </Menu>

        {offer.products && offer.products.length > 0 ? (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {offer.products[0].description}
            </Typography>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default OfferCard;
