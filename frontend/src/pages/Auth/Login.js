import React, { useState } from 'react';
import { Box, Stack, Card, Typography, TextField, Button, Alert, Link } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { authAPI } from '../../services/api';

const Login = () => {
  const navigate = useNavigate();
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      let response;
      if (isRegistering) {
        response = await authAPI.register({ email, password });
      } else {
        response = await authAPI.login(email, password);
      }
      
      // Cookie is set securely via HTTP-Only header on the backend
      localStorage.setItem('isAuthenticated', 'true');
      localStorage.setItem('user', JSON.stringify({ email: response.user.email }));
      navigate('/dashboard');
    } catch (err) {
      if (err.response && err.response.data && err.response.data.message) {
        setError(err.response.data.message);
      } else {
        setError('An error occurred. Make sure the backend is running on port 5000.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Stack 
      alignItems="center" 
      justifyContent="center" 
      sx={{ minHeight: '100vh', bgcolor: 'background.default', p: 2 }}
    >
      <Card sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Stack spacing={3} component="form" onSubmit={handleSubmit}>
          <Box textAlign="center">
            <Typography variant="h4" fontWeight="bold" color="primary.main" gutterBottom>
              {isRegistering ? 'Create Account' : 'Welcome Back'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isRegistering ? 'Sign up to launch your trading bot' : 'Sign in to your trading terminal'}
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Email Address"
            variant="outlined"
            type="email"
            fullWidth
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <TextField
            label="Password"
            variant="outlined"
            type="password"
            fullWidth
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <Button 
            type="submit" 
            variant="contained" 
            size="large" 
            fullWidth 
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : (isRegistering ? 'Sign Up' : 'Sign In')}
          </Button>

          <Box textAlign="center">
            <Typography variant="body2" color="text.secondary">
              {isRegistering ? 'Already have an account?' : "Don't have an account?"}{' '}
              <Link 
                component="button" 
                type="button" 
                variant="body2" 
                onClick={() => {
                  setIsRegistering(!isRegistering);
                  setError('');
                }}
              >
                {isRegistering ? 'Sign In' : 'Sign Up'}
              </Link>
            </Typography>
          </Box>
        </Stack>
      </Card>
    </Stack>
  );
};

export default Login;
