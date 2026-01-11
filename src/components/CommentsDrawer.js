import React, { useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  TextField,
  Button,
} from '@mui/material';

function formatTs(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}`;
}

export default function CommentsDrawer({
  open,
  onClose,
  offerTitle,
  offerId,
  pageIndex,
  comments,
  onAddComment,
}) {
  const [text, setText] = useState('');

  const title = useMemo(() => {
    const pageLabel = typeof pageIndex === 'number' ? `Side ${pageIndex + 1}` : '';
    const offerLabel = offerTitle ? offerTitle : (offerId ? `Tilbud ${offerId}` : 'Tilbud');
    return [pageLabel, offerLabel].filter(Boolean).join(' · ');
  }, [offerId, offerTitle, pageIndex]);

  const items = Array.isArray(comments) ? comments : [];

  const submit = () => {
    const t = String(text || '').trim();
    if (!t) return;
    if (typeof onAddComment === 'function' && offerId) {
      onAddComment(offerId, t, pageIndex);
      setText('');
    }
  };

  return (
    <Drawer anchor="right" open={!!open} onClose={onClose} PaperProps={{ sx: { width: 420 } }}>
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>
          Kommentarer
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
      </Box>

      <Divider />

      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {items.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            Ingen kommentarer endnu.
          </Typography>
        ) : (
          <List dense>
            {items
              .slice()
              .sort((a, b) => String(a.at).localeCompare(String(b.at)))
              .map((c) => (
                <ListItem key={c.id} alignItems="flex-start">
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {c.user?.name || 'Ukendt'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatTs(c.at)}
                        </Typography>
                      </Box>
                    }
                    secondary={<Typography variant="body2">{c.text}</Typography>}
                  />
                </ListItem>
              ))}
          </List>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <TextField
          label="Skriv en kommentar"
          value={text}
          onChange={(e) => setText(e.target.value)}
          multiline
          minRows={2}
          size="small"
        />
        <Button variant="contained" onClick={submit} disabled={!offerId || !String(text || '').trim()}>
          Tilføj kommentar
        </Button>
      </Box>
    </Drawer>
  );
}
