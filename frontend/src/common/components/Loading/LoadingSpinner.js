import React from 'react';
import { Box, CircularProgress, Typography, Stack } from '@mui/material';

const LoadingSpinner = ({ message = 'Loading...' }) => {
  return (
    <Box 
      sx={{ 
        display: 'flex', 
        minHeight: '100vh', 
        alignItems: 'center', 
        justifyContent: 'center',
        bgcolor: 'background.default'
      }}
    >
      <Stack spacing={2} alignItems="center">
        <CircularProgress size={60} thickness={4} color="primary" />
        <Typography variant="h6" color="text.secondary" fontWeight="500">
          {message}
        </Typography>
      </Stack>
    </Box>
  );
};

export default LoadingSpinner;
