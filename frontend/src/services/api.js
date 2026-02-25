import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Automatically send HTTP-only cookies
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor removed; HTTP-only cookies are sent automatically via withCredentials.

// Add a response interceptor to handle 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear auth flag and redirect to login if unauthorized
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('user');
      window.dispatchEvent(new Event('auth-expired'));
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (email, password) => {
    const response = await apiClient.post('/auth/login', { email, password });
    return response.data;
  },
  register: async (userData) => {
    const response = await apiClient.post('/auth/register', userData);
    return response.data;
  },
  logout: async () => {
    // Optionally call backend to invalidate cookie here: await apiClient.post('/auth/logout');
    localStorage.removeItem('isAuthenticated');
    localStorage.removeItem('user');
  },
};

export const tradesAPI = {
  getToday: async () => {
    const response = await apiClient.get('/trades/today');
    return response.data;
  },
};

export default apiClient;
