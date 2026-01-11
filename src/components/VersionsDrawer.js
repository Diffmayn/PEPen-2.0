import React, { useMemo, useState } from 'react';
import {
  Drawer,
  Box,
  Typography,
  Divider,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
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

export default function VersionsDrawer({
  open,
  onClose,
  versions,
  audit,
  onRevert,
  onSaveNow,
}) {
  const [tab, setTab] = useState(0);

  const versionItems = useMemo(() => (Array.isArray(versions) ? versions : []), [versions]);
  const auditItems = useMemo(() => (Array.isArray(audit) ? audit : []), [audit]);

  return (
    <Drawer anchor="right" open={!!open} onClose={onClose} PaperProps={{ sx: { width: 480 } }}>
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>
            Versionshistorik
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Auto-saves sker løbende, og du kan gendanne tidligere versioner.
          </Typography>
        </Box>
        <Button variant="outlined" onClick={onSaveNow}>
          Gem version nu
        </Button>
      </Box>

      <Divider />

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
        <Tab label="Versioner" />
        <Tab label="Audit log" />
      </Tabs>

      <Divider />

      <Box sx={{ p: 2, flex: 1, overflow: 'auto' }}>
        {tab === 0 ? (
          <>
            {versionItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Ingen versioner endnu.
              </Typography>
            ) : (
              <List dense>
                {versionItems.map((v) => (
                  <ListItem
                    key={v.id}
                    secondaryAction={
                      <Button size="small" variant="contained" onClick={() => onRevert(v.id)}>
                        Gendan
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {v.summary || 'Version'}
                        </Typography>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatTs(v.at)} · {v.user?.name || 'Ukendt'}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        ) : (
          <>
            {auditItems.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                Ingen audit entries endnu.
              </Typography>
            ) : (
              <List dense>
                {auditItems.slice(0, 200).map((a) => (
                  <ListItem key={a.id}>
                    <ListItemText
                      primary={<Typography variant="body2">{a.message}</Typography>}
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {formatTs(a.at)} · {a.user?.name || 'System'}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </>
        )}
      </Box>
    </Drawer>
  );
}
