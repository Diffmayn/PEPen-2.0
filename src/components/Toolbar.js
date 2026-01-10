import React, { useState } from 'react';
import { AppBar, Toolbar as MuiToolbar, IconButton, Button, Box, Menu, MenuItem, Typography, Tooltip, Switch, FormControlLabel } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SaveIcon from '@mui/icons-material/Save';
import EditIcon from '@mui/icons-material/Edit';
import VisibilityIcon from '@mui/icons-material/Visibility';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';

function Toolbar({ onExportPDF, onSaveChanges, editMode, setEditMode, hasData, technicalView, setTechnicalView, onResetLayout }) {
  const [saveMenuAnchor, setSaveMenuAnchor] = useState(null);
  const [pdfMenuAnchor, setPdfMenuAnchor] = useState(null);

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
      <MuiToolbar>
        <Typography variant="h6" component="div" sx={{ flexGrow: 0, mr: 3, fontWeight: 700 }}>
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
            </Box>

            <Box sx={{ display: 'flex', gap: 2 }}>
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
