import React from 'react';
import { Box, Typography, Button, Stack } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <Stack 
      alignItems="center" 
      justifyContent="center" 
      sx={{ minHeight: '100vh', bgcolor: 'background.default', textAlign: 'center', p: 3 }}
    >
      <Typography variant="h1" color="primary" sx={{ fontSize: '6rem', fontWeight: 800 }}>
        404
      </Typography>
      <Typography variant="h4" color="text.primary" gutterBottom>
        Page Not Found
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 400 }}>
        The page you are looking for doesn't exist or has been moved.
      </Typography>
      
      <Button variant="contained" size="large" onClick={() => navigate('/')}>
        Return to Dashboard
      </Button>
    </Stack>
  );
};

export default NotFound;
