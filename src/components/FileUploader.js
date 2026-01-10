import React, { useCallback } from 'react';
import { Box, Paper, Typography, Button, Divider, Select, MenuItem, FormControl, InputLabel, Tooltip } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import './FileUploader.css';

function FileUploader({
  onFilesUpload,
  error,
  canPickDirectory,
  onPickDirectory,
  folderEvents,
  selectedEventId,
  onSelectEvent,
  onLoadSelectedEvent,
  onRefreshDirectory,
  folderStatus,
}) {
  const [dragActive, setDragActive] = React.useState(false);

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesUpload(Array.from(e.dataTransfer.files));
    }
  }, [onFilesUpload]);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files.length > 0) {
      onFilesUpload(Array.from(e.target.files));
    }
  };

  return (
    <Box className="file-uploader-container">
      <Paper
        className={`file-uploader ${dragActive ? 'drag-active' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <CloudUploadIcon sx={{ fontSize: 80, color: '#1976d2', mb: 2 }} />
        <Typography variant="h5" gutterBottom>
          Indlæs XML-par
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          Træk og slip IPR og Leaflet XML-filer her, eller klik for at vælge
        </Typography>
        <input
          type="file"
          id="file-input"
          multiple
          accept=".xml"
          onChange={handleChange}
          style={{ display: 'none' }}
        />
        <label htmlFor="file-input">
          <Button
            variant="contained"
            component="span"
            startIcon={<CloudUploadIcon />}
          >
            Vælg filer
          </Button>
        </label>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ width: '100%', maxWidth: 560, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Indlæs fra mappe
          </Typography>

          <Tooltip
            title={
              canPickDirectory
                ? 'Vælg en mappe og vælg event for automatisk IPR+Leaflet pairing'
                : 'Browseren understøtter ikke mappe-adgang (window.showDirectoryPicker)'
            }
          >
            <span>
              <Button
                variant="outlined"
                startIcon={<FolderOpenIcon />}
                disabled={!canPickDirectory || typeof onPickDirectory !== 'function'}
                onClick={() => onPickDirectory()}
              >
                Indlæs fra mappe
              </Button>
            </span>
          </Tooltip>

          {folderStatus ? (
            <Typography variant="caption" color="text.secondary">
              {folderStatus}
            </Typography>
          ) : null}

          {Array.isArray(folderEvents) && folderEvents.length > 0 ? (
            <>
              <FormControl size="small" fullWidth>
                <InputLabel id="event-select-label">Vælg event</InputLabel>
                <Select
                  labelId="event-select-label"
                  label="Vælg event"
                  value={selectedEventId || ''}
                  onChange={(e) => {
                    if (typeof onSelectEvent === 'function') onSelectEvent(e.target.value);
                  }}
                >
                  {folderEvents.map((ev) => (
                    <MenuItem key={ev.eventId} value={ev.eventId} disabled={!ev.hasPair}>
                      {ev.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {folderEvents.some((ev) => !ev.hasPair) ? (
                <Typography variant="caption" color="text.secondary">
                  Events markeret med ⚠ kan ikke indlæses (mangler IPR eller Leaflet).
                </Typography>
              ) : null}

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  disabled={!selectedEventId || typeof onLoadSelectedEvent !== 'function'}
                  onClick={() => onLoadSelectedEvent()}
                >
                  Indlæs valgt event
                </Button>
                <Button
                  variant="text"
                  disabled={typeof onRefreshDirectory !== 'function'}
                  onClick={() => onRefreshDirectory()}
                >
                  Opdater liste
                </Button>
              </Box>
            </>
          ) : null}
        </Box>
        
        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 2 }}>
            {error}
          </Typography>
        )}

        <Box sx={{ mt: 4, p: 2, bgcolor: '#f9f9f9', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            <strong>Tip:</strong> Upload både IPR- og Leaflet-XML for den samme kampagne<br/>
            (f.eks. PMR_L1526052_IPR_*.xml og PMR_L1526052_Leaflet_*.xml)
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}

export default FileUploader;
