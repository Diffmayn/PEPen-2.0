import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { AppBar, Toolbar as MuiToolbar, IconButton, Button, Box, Menu, MenuItem, Typography, Tooltip, Switch, FormControlLabel, Select, Badge, Avatar, AvatarGroup, Autocomplete, TextField } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import HistoryIcon from '@mui/icons-material/History';
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail';

import { mapStatusLabel } from '../utils/collab';

function Toolbar({
  onExportPDF,
  onSaveChanges,
  editMode,
  setEditMode,
  hasData,
  technicalView,
  setTechnicalView,
  onResetLayout,
  collabEnabled,
  collabToggleDisabled,
  onToggleCollabEnabled,
  collabConnected,
  collabUsers,
  leafletStatus,
  onSetLeafletStatus,
  notifications,
  notificationsUnread,
  onMarkNotificationsRead,
  onOpenVersions,
  mentionsUnread,
  onOpenMentions,
  proofingEnabled,
  setProofingEnabled,
  proofingUnavailableReason,
  proofingIssueCount,
  offerIdOptions,
  selectedOfferId,
  onSelectOfferId,
  purchasingGroupOptions,
  selectedPurchasingGroup,
  onSelectPurchasingGroup,
}) {
  const [saveMenuAnchor, setSaveMenuAnchor] = useState(null);
  const [pdfMenuAnchor, setPdfMenuAnchor] = useState(null);
  const [notificationsAnchor, setNotificationsAnchor] = useState(null);

  const statusValue = String(leafletStatus || 'draft');
  const statusOptions = useMemo(
    () => [
      { value: 'draft', label: 'Kladde' },
      { value: 'in_review', label: 'Til review' },
      { value: 'approved', label: 'Godkendt' },
      { value: 'published', label: 'Publiceret' },
    ],
    []
  );

  const openPdfMenu = (e) => {
    setPdfMenuAnchor(e.currentTarget);
  };

  const openSaveMenu = (e) => {
    setSaveMenuAnchor(e.currentTarget);
  };

  const closePdfMenu = () => {
    setPdfMenuAnchor(null);
  };

  const closeSaveMenu = () => {
    setSaveMenuAnchor(null);
  };

  const openNotifications = (e) => {
    setNotificationsAnchor(e.currentTarget);
    if (typeof onMarkNotificationsRead === 'function') onMarkNotificationsRead();
  };

  const closeNotifications = () => {
    setNotificationsAnchor(null);
  };

  const handleExport = (mode) => {
    closePdfMenu();
    if (typeof onExportPDF === 'function') {
      onExportPDF(mode);
    }
  };

  const handleSave = (mode) => {
    closeSaveMenu();
    if (typeof onSaveChanges === 'function') {
      onSaveChanges(mode);
    }
  };

  return (
    <AppBar
      position="sticky"
      elevation={1}
      color="default"
      sx={{
        borderBottom: '1px solid rgba(0,0,0,0.08)'
      }}
    >
      <MuiToolbar variant="dense" sx={{ minHeight: 48 }}>
        <Typography variant="subtitle1" component="div" sx={{ flexGrow: 0, mr: 2, fontWeight: 700 }}>
          PEPen 2.0
        </Typography>

        {hasData && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mr: 'auto' }}>
              <Tooltip title="Vis tekniske detaljer for fejlsøgning">
                <FormControlLabel
                  sx={{ userSelect: 'none', mr: 1 }}
                  control={
                    <Switch
                      checked={!!technicalView}
                      onChange={(e) => {
                        const next = e.target.checked;
                        if (typeof setTechnicalView === 'function') setTechnicalView(next);
                        if (next && typeof setEditMode === 'function') setEditMode(false);
                      }}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">Teknisk visning</Typography>}
                />
              </Tooltip>

              <Tooltip
                title={
                  proofingUnavailableReason
                    ? proofingUnavailableReason
                    : (proofingIssueCount
                      ? `${proofingIssueCount} mulig(e) stavefejl fundet`
                      : 'Stavekontrol (dansk)'
                    )
                }
              >
                <FormControlLabel
                  sx={{ userSelect: 'none', mr: 1 }}
                  control={
                    <Switch
                      checked={!!proofingEnabled}
                      onChange={(e) => {
                        if (typeof setProofingEnabled === 'function') setProofingEnabled(e.target.checked);
                      }}
                      size="small"
                      disabled={!!proofingUnavailableReason}
                    />
                  }
                  label={<Typography variant="body2">Stavekontrol</Typography>}
                />
              </Tooltip>

              <Tooltip
                title={
                  technicalView
                    ? 'Slå teknisk visning fra for at redigere'
                    : (editMode ? 'Skift til visningstilstand' : 'Skift til redigeringstilstand')
                }
              >
                <span>
                  <IconButton
                    color="inherit"
                    onClick={() => setEditMode(!editMode)}
                    disabled={!!technicalView}
                  >
                    {editMode ? <VisibilityIcon /> : <EditIcon />}
                  </IconButton>
                </span>
              </Tooltip>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 1.5 }}>
                <Autocomplete
                  size="small"
                  disablePortal
                  options={Array.isArray(offerIdOptions) ? offerIdOptions : []}
                  value={
                    (Array.isArray(offerIdOptions) ? offerIdOptions : []).find((o) => String(o?.id || '').trim() === String(selectedOfferId || '').trim()) || null
                  }
                  onChange={(_, value) => {
                    if (typeof onSelectOfferId === 'function') {
                      onSelectOfferId(value?.id ? String(value.id) : '');
                    }
                  }}
                  isOptionEqualToValue={(opt, val) => String(opt?.id || '') === String(val?.id || '')}
                  getOptionLabel={(opt) => String(opt?.label || opt?.id || '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Offer ID"
                      placeholder="Vælg..."
                      variant="outlined"
                    />
                  )}
                  sx={{ width: 240 }}
                  clearOnEscape
                />

                <Autocomplete
                  size="small"
                  disablePortal
                  options={Array.isArray(purchasingGroupOptions) ? purchasingGroupOptions : []}
                  value={
                    (Array.isArray(purchasingGroupOptions) ? purchasingGroupOptions : []).find((o) => String(o?.key || '').trim() === String(selectedPurchasingGroup || '').trim()) || null
                  }
                  onChange={(_, value) => {
                    if (typeof onSelectPurchasingGroup === 'function') {
                      onSelectPurchasingGroup(value?.key ? String(value.key) : '');
                    }
                  }}
                  isOptionEqualToValue={(opt, val) => String(opt?.key || '') === String(val?.key || '')}
                  getOptionLabel={(opt) => String(opt?.label || opt?.key || '')}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Indkøbsgruppe"
                      placeholder="Vælg..."
                      variant="outlined"
                    />
                  )}
                  sx={{ width: 220 }}
                  clearOnEscape
                />
              </Box>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Tooltip
                title={
                  collabToggleDisabled
                    ? 'Samarbejde er styret af REACT_APP_COLLAB'
                    : (collabEnabled
                      ? (collabConnected ? 'Samarbejde online' : 'Samarbejde offline (start server)')
                      : 'Samarbejde slået fra lokalt')
                }
              >
                <FormControlLabel
                  sx={{ userSelect: 'none', mr: 0.5 }}
                  control={
                    <Switch
                      checked={!!collabEnabled}
                      onChange={(e) => {
                        if (typeof onToggleCollabEnabled === 'function') {
                          onToggleCollabEnabled(e.target.checked);
                        }
                      }}
                      disabled={!!collabToggleDisabled}
                      size="small"
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontWeight: 700 }}>Samarbejde</Typography>}
                />
              </Tooltip>

              {collabEnabled && (
                <Tooltip title="Status">
                  <span>
                    <Select
                      size="small"
                      value={statusValue}
                      onChange={(e) => {
                        if (typeof onSetLeafletStatus === 'function') onSetLeafletStatus(e.target.value);
                      }}
                      disabled={!collabConnected}
                      sx={{ minWidth: 130 }}
                    >
                      {statusOptions.map((o) => (
                        <MenuItem key={o.value} value={o.value}>
                          {o.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </span>
                </Tooltip>
              )}

              {collabEnabled && (
                <Tooltip title="Versionshistorik">
                  <span>
                    <IconButton onClick={onOpenVersions} disabled={!collabConnected}>
                      <HistoryIcon />
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              {collabEnabled && (
                <Tooltip title="Mentions">
                  <span>
                    <IconButton onClick={onOpenMentions} disabled={!collabConnected} aria-label="Mentions">
                      <Badge color="secondary" badgeContent={mentionsUnread} invisible={!mentionsUnread}>
                        <AlternateEmailIcon />
                      </Badge>
                    </IconButton>
                  </span>
                </Tooltip>
              )}

              {collabEnabled && (
                <>
                  <Tooltip title="Notifikationer">
                    <span>
                      <IconButton onClick={openNotifications} disabled={!collabConnected}>
                        <Badge color="secondary" badgeContent={notificationsUnread} invisible={!notificationsUnread}>
                          <NotificationsNoneIcon />
                        </Badge>
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Menu
                    anchorEl={notificationsAnchor}
                    open={Boolean(notificationsAnchor)}
                    onClose={closeNotifications}
                    PaperProps={{ sx: { width: 360, maxHeight: 420 } }}
                  >
                    {(notifications || []).slice(0, 25).map((n) => (
                      <MenuItem key={n.id} disabled>
                        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                          <Typography variant="body2">{n.message}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {n.user?.name || mapStatusLabel(n.type)}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                    {(!notifications || notifications.length === 0) && (
                      <MenuItem disabled>
                        <Typography variant="body2" color="text.secondary">
                          Ingen notifikationer endnu.
                        </Typography>
                      </MenuItem>
                    )}
                  </Menu>
                </>
              )}

              {collabEnabled && Array.isArray(collabUsers) && collabUsers.length > 0 && (
                <Tooltip title="Aktive brugere">
                  <AvatarGroup max={5} sx={{ '& .MuiAvatar-root': { width: 28, height: 28, fontSize: 12 } }}>
                    {collabUsers.map((u) => (
                      <Avatar key={u.userId} sx={{ bgcolor: u.color || 'primary.main' }}>
                        {String(u.name || '?').trim().slice(0, 1).toUpperCase()}
                      </Avatar>
                    ))}
                  </AvatarGroup>
                </Tooltip>
              )}

              {editMode && !technicalView && (
                <Tooltip title="Nulstil sidens layout til XML-standard">
                  <span>
                    <Button
                      color="inherit"
                      onClick={() => {
                        if (typeof onResetLayout === 'function') onResetLayout();
                      }}
                    >
                      Nulstil layout
                    </Button>
                  </span>
                </Tooltip>
              )}

              <Button
                color="inherit"
                startIcon={<SaveIcon />}
                endIcon={<ArrowDropDownIcon />}
                onClick={openSaveMenu}
              >
                Gem ændringer
              </Button>
              <Menu
                anchorEl={saveMenuAnchor}
                open={Boolean(saveMenuAnchor)}
                onClose={closeSaveMenu}
              >
                <MenuItem onClick={() => handleSave('json')}>
                  Download ændringer (JSON)
                </MenuItem>
                <MenuItem onClick={() => handleSave('leaflet-xml')}>
                  Download Leaflet XML (opdateret)
                </MenuItem>
              </Menu>
              <Button
                color="inherit"
                startIcon={<PictureAsPdfIcon />}
                endIcon={<ArrowDropDownIcon />}
                onClick={openPdfMenu}
              >
                Eksporter PDF
              </Button>
              <Menu
                anchorEl={pdfMenuAnchor}
                open={Boolean(pdfMenuAnchor)}
                onClose={closePdfMenu}
              >
                <MenuItem onClick={() => handleExport('pages')}>
                  PDF (én side pr. side)
                </MenuItem>
                <MenuItem onClick={() => handleExport('scroll')}>
                  PDF (lang rulle)
                </MenuItem>
              </Menu>
            </Box>
          </>
        )}
      </MuiToolbar>
    </AppBar>
  );
}

export default Toolbar;
