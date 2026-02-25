import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Box, Stack, Typography, Card, CardContent, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import WifiOffIcon from '@mui/icons-material/WifiOff';
import { useWebSocket } from '../../services/websocket';
import { tradesAPI } from '../../services/api';
import BalanceChart from './components/BalanceChart';
import TradeList from './components/TradeList';

const Dashboard = () => {
  const { isConnected, connectionError, lastMessage, sendMessage, reconnect } = useWebSocket();
  
  const [botStatus, setBotStatus] = useState('STOPPED');
  const [accountBalance, setAccountBalance] = useState(null);
  const [balanceHistory, setBalanceHistory] = useState([]);
  const [trades, setTrades] = useState([]);

  // Hydrate today's trades from the database on mount
  useEffect(() => {
    const loadTodaysTrades = async () => {
      try {
        const dbTrades = await tradesAPI.getToday();

        // Map DB trades to UI shape (newest first for the list)
        const uiTrades = dbTrades.map(t => ({
          id: t.contract_id,
          symbol: t.symbol,
          action: t.trigger_reason === 'MULTUP' ? 'BUY' : 'SELL',
          status: t.status,
          profit: t.profit,
          time: new Date(t.entry_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        })).reverse();
        setTrades(uiTrades);

        // Build balance history from closed trades (they have account_balance stored)
        const closedTrades = dbTrades.filter(t => t.status === 'CLOSED' && t.account_balance != null);
        const history = closedTrades.map(t => ({
          time: new Date(t.exit_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          balance: t.account_balance,
        }));
        setBalanceHistory(history);

        // Set the current balance from the most recent closed trade
        if (closedTrades.length > 0) {
          setAccountBalance(closedTrades[closedTrades.length - 1].account_balance);
        }
      } catch (err) {
        // Silently fail — WS will push live data anyway
        console.warn('Could not load today\'s trades:', err.message);
      }
    };

    loadTodaysTrades();
  }, []);

  // Process incoming messages
  useEffect(() => {
    if (!lastMessage) return;

    switch (lastMessage.type) {
      case 'BOT_STATUS':
        setBotStatus(lastMessage.status);
        break;
      case 'BALANCE_UPDATE':
        setAccountBalance(lastMessage.balance);
        setBalanceHistory(prev => {
          const newPoint = { 
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 
            balance: lastMessage.balance 
          };
          return [...prev, newPoint].slice(-20);
        });
        break;
      case 'TRADE_OPEN':
        setTrades(prev => [{ ...lastMessage.trade, status: 'OPEN', time: new Date().toLocaleTimeString() }, ...prev]);
        break;
      case 'TRADE_CLOSE':
        setTrades(prev => prev.map(t => 
          t.id === lastMessage.trade.id ? { ...t, status: 'CLOSED', profit: lastMessage.trade.profit, closeTime: new Date().toLocaleTimeString() } : t
        ));
        break;
      default:
        break;
    }
  }, [lastMessage]);

  const handleToggleBot = useCallback(() => {
    const nextStatus = botStatus === 'RUNNING' ? 'STOP' : 'START';
    sendMessage({ type: 'COMMAND', action: nextStatus });
    
    if (!isConnected) {
        setBotStatus(nextStatus === 'START' ? 'RUNNING' : 'STOPPED');
    }
  }, [botStatus, sendMessage, isConnected]);

  const dailyPnl = useMemo(() => {
    return trades
      .filter(t => t.status === 'CLOSED' && t.profit != null)
      .reduce((sum, t) => sum + t.profit, 0);
  }, [trades]);


  return (
    <Stack spacing={3} sx={{ height: '100%', minHeight: 0 }}>
      {/* Connection Error Modal */}
      <Dialog 
        open={connectionError} 
        PaperProps={{ sx: { textAlign: 'center', p: 2 } }}
      >
        <DialogTitle>
          <Stack alignItems="center" spacing={1}>
            <WifiOffIcon sx={{ fontSize: 48, color: 'error.main' }} />
            <Typography variant="h6">Connection Lost</Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            Unable to connect to the trading server. Please try again later.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2 }}>
          <Button variant="contained" onClick={reconnect}>
            Reconnect
          </Button>
        </DialogActions>
      </Dialog>

      {/* Top Controls & Summary */}
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems="center" spacing={2}>
        <Box>
          <Typography variant="h4" fontWeight="bold">
            Trading Dashboard
            <Typography component="span" variant="h5" fontWeight="bold" sx={{ ml: 1.5, color: dailyPnl >= 0 ? 'success.main' : 'error.main' }}>
              | {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
            </Typography>
          </Typography>
          <Typography variant="body2" color={isConnected ? 'success.main' : 'warning.main'}>
            WebSocket: {isConnected ? 'Connected' : 'Disconnected'}
          </Typography>
        </Box>

        <Stack direction="row" spacing={2}>
          <Card sx={{ minWidth: 200 }}>
            <CardContent sx={{ py: '16px !important', px: 3 }}>
              <Typography variant="body2" color="text.secondary">Current Balance</Typography>
              <Typography variant="h5" fontWeight="bold" color={accountBalance == null ? 'text.secondary' : accountBalance >= 10000 ? 'success.main' : 'error.main'}>
                {accountBalance != null ? `$${accountBalance.toFixed(2)}` : '—'}
              </Typography>
            </CardContent>
          </Card>
          
          <Button
            variant="contained"
            color={botStatus === 'RUNNING' ? 'error' : 'primary'}
            startIcon={botStatus === 'RUNNING' ? <PauseIcon /> : <PlayArrowIcon />}
            onClick={handleToggleBot}
            sx={{ px: 4, py: 1.5, fontSize: '1.1rem' }}
          >
            {botStatus === 'RUNNING' ? 'Pause Bot' : 'Start Bot'}
          </Button>
        </Stack>
      </Stack>

      {/* Main Grid Content */}
      <Box sx={{ 
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: '2fr 1fr' },
        gap: 3,
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}>
        <BalanceChart data={balanceHistory} />
        <TradeList trades={trades} />
      </Box>
    </Stack>
  );
};

export default Dashboard;
