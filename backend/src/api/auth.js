import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { JWT_SECRET, COOKIE_NAME } from '../authConfig.js';

const router = express.Router();

// Middleware to protect routes (can be exported if needed elsewhere)
export const authenticateToken = (req, res, next) => {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token.' });
  }
};

// @route POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Input Validation
    if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters.' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return res.status(400).json({ message: 'Invalid email format.' });

    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: 'User already exists' });

    user = new User({ email, password });
    await user.save();

    // Generate JWT
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

    // Set HTTP-Only Cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.status(201).json({ message: 'User registered successfully', user: { email: user.email } });
  } catch (error) {
    console.error('Registration Error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });

    // Generate JWT
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, { expiresIn: '1d' });

    // Set HTTP-Only Cookie
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({ message: 'Logged in successfully', user: { email: user.email } });
  } catch (error) {
    console.error('Login Error:', error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});

// @route POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ message: 'Logged out successfully' });
});

// @route GET /api/auth/me (Protected Route Check)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server Error' });
  }
});

export default router;
