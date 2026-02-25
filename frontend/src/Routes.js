import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes as Switch, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';

import theme from './common/utils/theme';
import MainLayout from './common/components/Layout/MainLayout';
import LoadingSpinner from './common/components/Loading/LoadingSpinner';

// Lazy load pages for code splitting and Suspense
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'));
const Login = lazy(() => import('./pages/Auth/Login'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));

// A simple protective route component (assuming localStorage for simplicity)
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('isAuthenticated');
  // If no auth flag exists, immediately redirect to login.
  if (!isAuthenticated) {
    // return <Navigate to="/login" replace />;
    return children; // For dev purposes, bypassing auth initially
  }
  return children;
};

const Routes = () => {
  return (
    <ThemeProvider theme={theme}>
      {/* CssBaseline kickstart an elegant, consistent, and simple baseline to build upon. */}
      <CssBaseline />
      <BrowserRouter>
        <Suspense fallback={<LoadingSpinner message="Loading application..." />}>
          <Switch>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <MainLayout>
                    <Dashboard />
                  </MainLayout>
                </ProtectedRoute>
              } 
            />
            
            <Route path="*" element={<NotFound />} />
          </Switch>
        </Suspense>
      </BrowserRouter>
    </ThemeProvider>
  );
};

export default Routes;
