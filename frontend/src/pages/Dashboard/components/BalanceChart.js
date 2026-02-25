import React from 'react';
import { Card, CardContent, Typography, Box } from '@mui/material';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <Box sx={{ 
      bgcolor: '#1e293b', 
      border: '1px solid rgba(99, 102, 241, 0.3)', 
      borderRadius: 1.5, 
      px: 1.5, py: 1,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <Typography variant="caption" color="text.secondary" display="block">Time: {label}</Typography>
      <Typography variant="body2" fontWeight={700} color="primary.main">
        Balance: ${Number(payload[0].value).toFixed(2)}
      </Typography>
    </Box>
  );
};

const BalanceChart = ({ data = [] }) => {
  return (
    <Card sx={{ 
      height: '100%',
      display: 'flex', 
      flexDirection: 'column',
    }}>
      <CardContent sx={{ pb: 0, px: { xs: 2, md: 3 } }}>
        <Typography variant="h6" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ShowChartIcon sx={{ color: 'primary.main', fontSize: 22 }} />
          Account Balance
        </Typography>
      </CardContent>
      <Box sx={{ flexGrow: 1, px: { xs: 0.5, md: 2 }, pb: 2, pt: 1, minHeight: 0 }}>
        {data.length === 0 ? (
          <Box display="flex" alignItems="center" justifyContent="center" height="100%" flexDirection="column" gap={1}>
            <ShowChartIcon sx={{ fontSize: 48, color: 'rgba(255,255,255,0.08)' }} />
            <Typography variant="body2" color="text.secondary">
              Start the bot to see balance data.
            </Typography>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis 
                dataKey="time" 
                stroke="transparent" 
                tick={{ fill: '#64748b', fontSize: 11 }} 
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={['auto', 'auto']} 
                stroke="transparent" 
                tick={{ fill: '#64748b', fontSize: 11 }} 
                tickFormatter={(value) => `$${value}`}
                width={65}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="#6366f1" 
                strokeWidth={2.5} 
                fill="url(#balanceGradient)"
                dot={false}
                activeDot={{ r: 5, fill: '#6366f1', stroke: '#0f172a', strokeWidth: 3 }} 
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Box>
    </Card>
  );
};

export default BalanceChart;
