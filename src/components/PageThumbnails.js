import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Paper, Typography, Tooltip } from '@mui/material';
import './PageThumbnails.css';

function PageThumbnails({ areas, currentPage, onPageSelect, thumbnails, onRequestThumbnail }) {
  const itemRefs = useRef([]);

  const safeThumbs = useMemo(() => thumbnails || {}, [thumbnails]);

  useEffect(() => {
    if (typeof onRequestThumbnail !== 'function') return;
    if (!('IntersectionObserver' in window)) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number(entry.target.dataset.index);
          if (Number.isNaN(index)) continue;
          if (safeThumbs[index]) continue;
          onRequestThumbnail(index);
        }
      },
      { root: null, rootMargin: '600px 0px', threshold: 0.01 }
    );

    itemRefs.current.forEach((el) => {
      if (el) obs.observe(el);
    });

    return () => obs.disconnect();
  }, [areas.length, onRequestThumbnail, safeThumbs]);

  return (
    <Box className="page-thumbnails">
      <Typography variant="subtitle2" sx={{ p: 2, fontWeight: 'bold', color: '#666' }}>
        Sider ({areas.length})
      </Typography>
      <Box className="thumbnails-grid">
        {areas.map((area, index) => (
          <Tooltip
            key={area.id || index}
            placement="right"
            enterDelay={250}
            title={
              safeThumbs[index] ? (
                <img
                  src={safeThumbs[index]}
                  alt={`Side ${area.pageNumber} preview`}
                  style={{ width: 240, display: 'block' }}
                />
              ) : (
                <Typography variant="caption">Preview indlæses...</Typography>
              )
            }
          >
            <Paper
              className={`thumbnail ${currentPage === index ? 'active' : ''}`}
              onClick={() => onPageSelect(index)}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              data-index={index}
            >
              <Box className="thumb-image">
                {safeThumbs[index] ? (
                  <img src={safeThumbs[index]} alt={`Side ${area.pageNumber}`} loading="lazy" />
                ) : (
                  <Box className="thumb-placeholder" />
                )}
              </Box>
              <Box className="thumbnail-meta">
                <Typography variant="caption" className="page-number">
                  Side {area.pageNumber}
                </Typography>
                <Typography variant="caption" className="page-name" noWrap>
                  {area.name}
                </Typography>
              </Box>
            </Paper>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}

export default PageThumbnails;
