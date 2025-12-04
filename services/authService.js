import { createClient } from 'redis';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: REDIS_URL });

redisClient.on('error', (err) => console.error('Redis Client Error', err));

await redisClient.connect();

const SESSION_TTL = 24 * 60 * 60; // 24 hours

export const checkLockout = async (ip) => {
  const key = `login_attempts:${ip}`;
  const data = await redisClient.get(key);
  
  if (!data) return null;
  
  const { lockoutUntil } = JSON.parse(data);
  if (lockoutUntil && Date.now() < lockoutUntil) {
    const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
    return remaining;
  }
  return null;
};

export const handleLoginAttempt = async (ip, username, password) => {
  const key = `login_attempts:${ip}`;
  let data = await redisClient.get(key);
  data = data ? JSON.parse(data) : { failedAttempts: 0, lockoutUntil: 0 };

  // Check if currently locked out (double check)
  if (data.lockoutUntil && Date.now() < data.lockoutUntil) {
    return { success: false, locked: true };
  }

  const storedPassword = process.env.ADMIN_PASSWORD;
  const storedUser = process.env.ADMIN_USERNAME;

  if (!storedPassword || !storedUser) {
    console.error("ADMIN_PASSWORD or ADMIN_USERNAME is not set in environment variables.");
    return { success: false, error: "Server configuration error" };
  }

  // Secure comparison using timingSafeEqual to prevent timing attacks
  const usernameMatch = username === storedUser;
  
  let passwordMatch = false;
  if (password && storedPassword) {
    const buffer1 = Buffer.from(password);
    const buffer2 = Buffer.from(storedPassword);
    
    if (buffer1.length === buffer2.length) {
      passwordMatch = crypto.timingSafeEqual(buffer1, buffer2);
    }
  }

  if (usernameMatch && passwordMatch) {
    // Reset attempts on success
    await redisClient.del(key);
    
    // Create session
    const sessionId = crypto.randomBytes(32).toString('hex');
    await redisClient.set(`session:${sessionId}`, 'valid', { EX: SESSION_TTL });
    
    return { success: true, sessionId };
  } else {
    // Increment failed attempts
    data.failedAttempts += 1;
    let lockoutDuration = 0;

    if (data.failedAttempts === 4) {
      lockoutDuration = 10 * 60 * 1000; // 10 minutes
    } else if (data.failedAttempts === 7) {
      lockoutDuration = 30 * 60 * 1000; // 30 minutes
    } else if (data.failedAttempts >= 9) {
      lockoutDuration = 60 * 60 * 1000; // 1 hour
    }

    if (lockoutDuration > 0) {
      data.lockoutUntil = Date.now() + lockoutDuration;
    }

    // Store updated data with expiry (e.g., 24 hours to keep track of history)
    await redisClient.set(key, JSON.stringify(data), { EX: 24 * 60 * 60 });

    return { success: false, locked: lockoutDuration > 0 };
  }
};

export const verifySession = async (sessionId) => {
  if (!sessionId) return false;
  const isValid = await redisClient.get(`session:${sessionId}`);
  return !!isValid;
};

export const logoutSession = async (sessionId) => {
  if (sessionId) {
    await redisClient.del(`session:${sessionId}`);
  }
};
