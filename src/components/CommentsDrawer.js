import React, { useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Divider,
  List,
  ListItem,
  ListItemText,
  Button,
  TextField,
} from '@mui/material';

import { dedupeStrings, isCompanyEmail } from '../utils/mentions';

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
  currentUserEmail,
}) {
  const [text, setText] = useState('');
  const [validationError, setValidationError] = useState('');

  const title = useMemo(() => {
    const pageLabel = typeof pageIndex === 'number' ? `Side ${pageIndex + 1}` : '';
    const offerLabel = offerTitle ? offerTitle : (offerId ? `Tilbud ${offerId}` : 'Tilbud');
    return [pageLabel, offerLabel].filter(Boolean).join(' · ');
  }, [offerId, offerTitle, pageIndex]);

  const items = Array.isArray(comments) ? comments : [];

  const renderCommentText = (raw) => {
    const t = String(raw || '');
    const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let last = 0;
    let m;
    while ((m = re.exec(t))) {
      const before = t.slice(last, m.index);
      if (before) parts.push(before);
      const display = String(m[1] || '').trim() || String(m[2] || '').trim();
      const email = String(m[2] || '').trim();
      parts.push(
        <a
          key={`${m.index}-${email}`}
          href={email ? `mailto:${email}` : undefined}
          className="pepen-mention"
          title={email ? `Send mail til ${email}` : undefined}
          onClick={(e) => {
            // keep default mailto behavior, but avoid it on invalid values
            if (!email) e.preventDefault();
          }}
        >
          @{display}
        </a>
      );
      last = m.index + m[0].length;
    }
    const rest = t.slice(last);
    if (rest) parts.push(rest);
    return <>{parts.map((p, idx) => (typeof p === 'string' ? <React.Fragment key={idx}>{p}</React.Fragment> : p))}</>;
  };

  const submit = () => {
    const t = String(text || '').trim();
    if (!t) return;
    if (!offerId) return;

    // Simple regex to extract @email patterns from plain text
    const emailPattern = /@([a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
    const matches = [];
    let match;
    while ((match = emailPattern.exec(t))) {
      matches.push(match[1]);
    }
    
    const mentionEmails = dedupeStrings(matches).filter((e) => isCompanyEmail(e));

    setValidationError('');
    if (typeof onAddComment === 'function') {
      onAddComment(offerId, { text: t, mentions: mentionEmails, offerTitle: offerTitle || '' }, pageIndex);
      setText('');
    }
  };

  return (
    <Drawer
      anchor="right"
      open={!!open}
      onClose={onClose}
      sx={{ zIndex: 1401 }}
      PaperProps={{ sx: { width: 420 } }}
    >
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
                <ListItem
                  key={c.id}
                  alignItems="flex-start"
                  sx={{
                    borderRadius: 1,
                    ...(currentUserEmail && Array.isArray(c.mentions) && c.mentions.some((e) => String(e).toLowerCase() === String(currentUserEmail).toLowerCase())
                      ? { bgcolor: 'rgba(30, 136, 229, 0.08)' }
                      : null),
                  }}
                >
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
                    secondary={<Typography variant="body2">{renderCommentText(c.text)}</Typography>}
                  />
                </ListItem>
              ))}
          </List>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Tag kollega: skriv @email
          </Typography>
          <TextField
            multiline
            fullWidth
            minRows={3}
            maxRows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Skriv en kommentar… (brug @ for at tagge kollega)"
            variant="outlined"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {validationError ? (
            <Typography variant="caption" color="error" sx={{ display: 'block', mt: 0.5 }}>
              {validationError}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              Tip: Brug Ctrl+Enter for at sende. Skriv @email for at tagge.
            </Typography>
          )}
        </Box>
        <Button variant="contained" onClick={submit} disabled={!offerId || !String(text || '').trim()}>
          Tilføj kommentar
        </Button>
      </Box>
    </Drawer>
  );
}
