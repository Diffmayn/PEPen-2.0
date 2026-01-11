import React, { useMemo, useState } from 'react';
import {
  Box,
  IconButton,
  Paper,
  Typography,
  Tooltip,
  Select,
  MenuItem,
  InputBase,
  Menu,
  Divider,
  Switch,
  FormControlLabel,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import SearchIcon from '@mui/icons-material/Search';
import SpellcheckIcon from '@mui/icons-material/Spellcheck';

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function BottomBar({
  hasData,
  currentPage,
  totalPages,
  onPrev,
  onNext,
  onJumpTo,
  zoom,
  setZoom,
  viewMode,
  setViewMode,
  flipEnabled,
  setFlipEnabled,
  isFullscreen,
  onToggleFullscreen,
  searchTerm,
  setSearchTerm,
  searchResults,
  onSelectSearchResult,
  proofingEnabled,
  proofingIssueCount,
  proofingIssues,
  onSelectProofingIssue,
}) {
  const [pageInput, setPageInput] = useState('');
  const [resultsAnchor, setResultsAnchor] = useState(null);
  const [proofingAnchor, setProofingAnchor] = useState(null);

  const pageLabel = useMemo(() => {
    if (!hasData) return 'Side 0 af 0';
    return `Side ${currentPage + 1} af ${totalPages}`;
  }, [currentPage, hasData, totalPages]);

  const canPrev = hasData && currentPage > 0;
  const canNext = hasData && currentPage < totalPages - 1;

  const applyJump = (raw) => {
    if (!hasData) return;
    const pageNum = Number(raw);
    if (Number.isNaN(pageNum)) return;
    const zeroBased = clamp(pageNum - 1, 0, totalPages - 1);
    onJumpTo(zeroBased);
  };

  const openResults = (e) => {
    if (!searchResults || searchResults.length === 0) return;
    setResultsAnchor(e.currentTarget);
  };

  const closeResults = () => {
    setResultsAnchor(null);
  };

  const openProofing = (e) => {
    if (!proofingEnabled) return;
    if (!proofingIssueCount) return;
    setProofingAnchor(e.currentTarget);
  };

  const closeProofing = () => {
    setProofingAnchor(null);
  };

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1300,
        px: 2,
        py: 0.75,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title="Forrige">
          <span>
            <IconButton onClick={onPrev} disabled={!canPrev} size="large">
              <ArrowBackIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Næste">
          <span>
            <IconButton onClick={onNext} disabled={!canNext} size="large">
              <ArrowForwardIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 220 }}>
        <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
          {pageLabel}
        </Typography>
        <InputBase
          placeholder="Hop"
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyJump(pageInput);
              setPageInput('');
            }
          }}
          onBlur={() => {
            if (pageInput.trim()) applyJump(pageInput);
            setPageInput('');
          }}
          disabled={!hasData}
          sx={{
            width: 70,
            px: 1,
            py: 0.25,
            border: '1px solid rgba(0,0,0,0.2)',
            borderRadius: 1,
            fontSize: 12,
          }}
          inputProps={{ inputMode: 'numeric' }}
        />
      </Box>

      <Divider orientation="vertical" flexItem />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Tooltip title="Zoom ud">
          <span>
            <IconButton onClick={() => setZoom((z) => clamp(z - 10, 50, 300))} disabled={!hasData || zoom <= 50}>
              <ZoomOutIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Typography variant="body2" sx={{ width: 48, textAlign: 'center' }}>
          {zoom}%
        </Typography>
        <Tooltip title="Zoom ind">
          <span>
            <IconButton onClick={() => setZoom((z) => clamp(z + 10, 50, 300))} disabled={!hasData || zoom >= 300}>
              <ZoomInIcon />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Box sx={{ minWidth: 160 }}>
        <Select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          size="small"
          disabled={!hasData}
          fullWidth
        >
          <MenuItem value="single">Enkelt side</MenuItem>
          <MenuItem value="spread">Opslag</MenuItem>
          <MenuItem value="mobile">Mobil</MenuItem>
          <MenuItem value="print">Udskrift</MenuItem>
        </Select>
      </Box>

      <FormControlLabel
        control={
          <Switch
            checked={!!flipEnabled}
            onChange={(e) => setFlipEnabled(e.target.checked)}
            disabled={!hasData}
          />
        }
        label="Flip-effekt"
        sx={{ userSelect: 'none' }}
      />

      <Divider orientation="vertical" flexItem />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, minWidth: 220 }}>
        <SearchIcon fontSize="small" />
        <InputBase
          placeholder="Søg i leaflet..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={!hasData}
          sx={{
            flex: 1,
            px: 1,
            py: 0.25,
            border: '1px solid rgba(0,0,0,0.2)',
            borderRadius: 1,
            fontSize: 12,
          }}
        />
        <Tooltip title="Søgeresultater">
          <span>
            <Typography
              variant="caption"
              sx={{ cursor: hasData && searchResults?.length ? 'pointer' : 'default' }}
              onClick={openResults}
            >
              {hasData && searchTerm ? `${searchResults.length} fundet` : ''}
            </Typography>
          </span>
        </Tooltip>
        <Menu
          anchorEl={resultsAnchor}
          open={Boolean(resultsAnchor)}
          onClose={closeResults}
          PaperProps={{ sx: { maxHeight: 360, width: 360 } }}
        >
          {(searchResults || []).slice(0, 50).map((r, idx) => (
            <MenuItem
              key={`${r.pageIndex}-${r.offerId}-${r.field}-${idx}`}
              onClick={() => {
                closeResults();
                onSelectSearchResult(r);
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="body2">
                  Side {r.pageIndex + 1} · {r.field}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {r.preview}
                </Typography>
              </Box>
            </MenuItem>
          ))}
          {searchResults && searchResults.length > 50 && (
            <MenuItem disabled>
              <Typography variant="caption">Viser de første 50 resultater</Typography>
            </MenuItem>
          )}
        </Menu>
      </Box>

      <Divider orientation="vertical" flexItem />

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 170 }}>
        <SpellcheckIcon fontSize="small" />
        <Tooltip title={proofingEnabled ? 'Stavefejl (klik for liste)' : 'Stavekontrol er slået fra'}>
          <span>
            <Typography
              variant="caption"
              sx={{ cursor: hasData && proofingEnabled && proofingIssueCount ? 'pointer' : 'default' }}
              onClick={openProofing}
            >
              {hasData
                ? (proofingEnabled
                  ? `${Number(proofingIssueCount || 0)} stavefejl`
                  : 'Stavekontrol fra')
                : ''}
            </Typography>
          </span>
        </Tooltip>
        <Menu
          anchorEl={proofingAnchor}
          open={Boolean(proofingAnchor)}
          onClose={closeProofing}
          PaperProps={{ sx: { maxHeight: 420, width: 420 } }}
        >
          {(proofingIssues || []).slice(0, 80).map((p, idx) => (
            <MenuItem
              key={`${p.pageIndex}-${p.offerId}-${p.field}-${p.word}-${idx}`}
              onClick={() => {
                closeProofing();
                if (typeof onSelectProofingIssue === 'function') onSelectProofingIssue(p);
              }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                <Typography variant="body2">
                  Side {Number(p.pageIndex) + 1} · Offer {p.offerId} · {p.field}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  “{p.word}” · {p.preview}
                </Typography>
              </Box>
            </MenuItem>
          ))}
          {proofingIssues && proofingIssues.length > 80 && (
            <MenuItem disabled>
              <Typography variant="caption">Viser de første 80 stavefejl</Typography>
            </MenuItem>
          )}
          {proofingIssues && proofingIssues.length === 0 && (
            <MenuItem disabled>
              <Typography variant="caption">Ingen stavefejl fundet</Typography>
            </MenuItem>
          )}
        </Menu>
      </Box>

      <Divider orientation="vertical" flexItem />

      <Tooltip title={isFullscreen ? 'Forlad fuld skærm' : 'Fuldt skærm'}>
        <span>
          <IconButton onClick={onToggleFullscreen} disabled={!hasData}>
            {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </IconButton>
        </span>
      </Tooltip>
    </Paper>
  );
}

export default BottomBar;
