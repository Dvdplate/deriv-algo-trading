import React from 'react';
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Stack } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LogoutIcon from '@mui/icons-material/Logout';
import { useNavigate } from 'react-router-dom';

const MainLayout = ({ children }) => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', height: '100vh', flexDirection: 'column', overflow: 'hidden' }}>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <Toolbar>
          <DashboardIcon sx={{ mr: 2, color: 'primary.main' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700 }}>
            AlgoTrader Pro
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            {/* User profile could be more detailed here */}
            <Avatar sx={{ bgcolor: 'primary.dark', width: 32, height: 32 }}>U</Avatar>
            <IconButton color="inherit" onClick={handleLogout} title="Logout">
              <LogoutIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          backgroundColor: 'background.default',
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};

export default MainLayout;
