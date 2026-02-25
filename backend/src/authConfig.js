export const COOKIE_NAME = 'session_token';

let secret = process.env.JWT_SECRET;
if (!secret) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: JWT_SECRET environment variable is required in production.');
  }
  secret = 'super-secret-trading-key-12345';
}

export const JWT_SECRET = secret;
