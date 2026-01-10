import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardMedia, Typography, Box, Chip, IconButton, TextField, Menu, MenuItem, Tooltip } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import './OfferCard.css';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, term) {
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
        <mark key={`${i}-${matches[i]}`} style={{ backgroundColor: '#fff59d' }}>
          {matches[i]}
        </mark>
      );
    }
  }
  return out;
}

function OfferCard({ offer, blockId, editMode, onClick, isSelected, areaIndex, blockIndex, onOfferUpdate, highlightTerm, layoutSize = 'standard', onSetLayoutSize }) {
  const [imageError, setImageError] = useState(false);
  const [layoutMenuAnchor, setLayoutMenuAnchor] = useState(null);
  const [draftHeadline, setDraftHeadline] = useState(offer.headline || offer.name || '');
  const [draftBodyText, setDraftBodyText] = useState(offer.bodyText || '');
  const [draftPrice, setDraftPrice] = useState(offer.price || '');

  const badgeText = useMemo(() => String(offer.salesText || '').trim(), [offer.salesText]);
  const normalPriceText = useMemo(() => String(offer.normalPrice || '').trim(), [offer.normalPrice]);
  const buyQuantityText = useMemo(() => String(offer.buyQuantity || '').trim(), [offer.buyQuantity]);
  const salesConditionText = useMemo(() => String(offer.salesCondition || '').trim(), [offer.salesCondition]);

  const displayImage = offer.images && offer.images.length > 0 ? offer.images[0].url : null;

  const handleImageError = () => {
    setImageError(true);
  };

  useEffect(() => {
    if (!isSelected) return;
    setDraftHeadline(offer.headline || offer.name || '');
    setDraftBodyText(offer.bodyText || '');
    setDraftPrice(offer.price || '');
  }, [isSelected, offer.bodyText, offer.headline, offer.name, offer.price]);

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

  return (
    <Card
      className={`offer-card ${isSelected ? 'selected' : ''} ${editMode ? 'editable' : ''}`}
      onClick={onClick}
      sx={{ cursor: editMode ? 'pointer' : 'default' }}
      data-blockid={blockId || undefined}
    >
      <Box className="offer-media" sx={{ position: 'relative' }}>
        {displayImage && !imageError ? (
          <CardMedia
            component="img"
            height="200"
            image={displayImage}
            alt={offer.headline || 'Product image'}
            onError={handleImageError}
            sx={{ objectFit: 'contain', bgcolor: 'action.hover' }}
          />
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

        {badgeText ? (
          <Box className="offer-badge" sx={{ bgcolor: 'secondary.main', color: 'secondary.contrastText' }}>
            <Typography variant="caption" sx={{ fontWeight: 800 }}>
              {highlightText(badgeText, highlightTerm)}
            </Typography>
          </Box>
        ) : null}
      </Box>

      <CardContent>
        {editMode && (
          <Box sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.5 }}>
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
          </Box>
        )}

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
              {highlightText(offer.headline || offer.name || 'Uden titel', highlightTerm)}
            </Typography>

            {offer.bodyText ? (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                {highlightText(offer.bodyText, highlightTerm)}
              </Typography>
            ) : null}

            {(normalPriceText || offer.price) ? (
              <Box className="offer-priceBlock">
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
                    color="secondary"
                    className="offer-price"
                    sx={{ fontWeight: 900, lineHeight: 1.05 }}
                  >
                    {highlightText(offer.price, highlightTerm)}
                  </Typography>
                ) : null}
                {(buyQuantityText || salesConditionText) ? (
                  <Typography variant="caption" color="text.secondary" className="offer-condition">
                    {buyQuantityText ? highlightText(buyQuantityText, highlightTerm) : null}
                    {buyQuantityText && salesConditionText ? ' · ' : null}
                    {salesConditionText ? highlightText(salesConditionText, highlightTerm) : null}
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
            <Chip label={badgeText} size="small" color="secondary" sx={{ fontWeight: 700 }} />
          ) : null}
          {offer.products && offer.products.length > 0 ? (
            <Chip
              label={`${offer.products.length} produkt${offer.products.length > 1 ? 'er' : ''}`}
              size="small"
              color="secondary"
              variant="outlined"
            />
          ) : null}
        </Box>

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
