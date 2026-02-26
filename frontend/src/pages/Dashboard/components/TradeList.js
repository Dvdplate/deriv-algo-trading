import React from 'react';
import { Card, CardContent, Typography, Stack, Box, Chip, Divider } from '@mui/material';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { List, AutoSizer } from 'react-virtualized';

const ROW_HEIGHT = 64;

const TradeList = ({ trades = [] }) => {
  const rowRenderer = ({ index, key, style }) => {
    const trade = trades[index];
    return (
      <div key={key} style={style}>
        <Stack 
          direction="row" 
          justifyContent="space-between" 
          alignItems="center"
          sx={{ 
            height: ROW_HEIGHT,
            px: 1.5,
            borderBottom: index < trades.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            transition: 'background 0.15s',
            '&:hover': { background: 'rgba(255,255,255,0.03)' },
          }}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ 
              width: 32, height: 32, 
              borderRadius: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: trade.action === 'BUY' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
            }}>
              {trade.action === 'BUY' 
                ? <ArrowUpwardIcon sx={{ fontSize: 18, color: 'success.main' }} /> 
                : <ArrowDownwardIcon sx={{ fontSize: 18, color: 'error.main' }} />
              }
            </Box>
            <Box>
              <Typography variant="body2" fontWeight={600} lineHeight={1.3}>
                {trade.symbol || 'VOL100'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {trade.action} • {trade.time}
              </Typography>
            </Box>
          </Stack>

          <Stack alignItems="flex-end" spacing={0.25}>
            <Chip 
              label={trade.status} 
              size="small" 
              sx={{ 
                height: 20, 
                fontSize: '0.68rem',
                fontWeight: 700,
                ...(trade.status === 'OPEN' 
                  ? { bgcolor: 'rgba(99,102,241,0.15)', color: 'primary.main' }
                  : { bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }
                ),
              }}
            />
            {trade.status === 'CLOSED' && trade.profit !== undefined && trade.profit !== null && (
              <Typography 
                variant="caption" 
                fontWeight={700}
                color={trade.profit >= 0 ? 'success.main' : 'error.main'}
              >
                {trade.profit >= 0 ? '+' : ''}{trade.profit.toFixed(2)}
              </Typography>
            )}
          </Stack>
        </Stack>
      </div>
    );
  };

  return (
    <Card sx={{ 
      height: '100%',
      display: 'flex', 
      flexDirection: 'column',
    }}>
      <CardContent sx={{ 
        pb: 0, 
        px: { xs: 2, md: 3 },
        flexShrink: 0,
      }}>
        <Typography variant="h6" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ReceiptLongIcon sx={{ color: 'primary.main', fontSize: 22 }} />
          Recent Trades
          {trades.length > 0 && (
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
              ({trades.length})
            </Typography>
          )}
        </Typography>
      </CardContent>

      <Box sx={{ 
        flexGrow: 1, 
        minHeight: 0,
        px: { xs: 0.5, md: 1 },
        pb: 1,
      }}>
        {trades.length === 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={1}>
            <ReceiptLongIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.08)' }} />
            <Typography variant="body2" color="text.secondary">
              No trades recorded yet.
            </Typography>
          </Box>
        ) : (
          <AutoSizer>
            {({ width, height }) => (
              <List
                width={width}
                height={height}
                rowCount={trades.length}
                rowHeight={ROW_HEIGHT}
                rowRenderer={rowRenderer}
                overscanRowCount={10}
                style={{ outline: 'none' }}
              />
            )}
          </AutoSizer>
        )}
      </Box>
    </Card>
  );
};

export default TradeList;
