import type { NextFunction, Request, Response } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { getOrCreateUser, isOwnerEmail } from '../db/users.ts';
import { adminAuth } from '../lib/firebase-admin.ts';

export interface DbUser {
  id: number;
  uid: string;
  email: string;
  role: string;
  fullName: string | null;
  age: number | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
}

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  dbUser?: DbUser;
  isOwner?: boolean;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing token' });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    if (!decodedToken.email || !decodedToken.email_verified) {
      res.status(403).json({ error: 'Verified email is required.' });
      return;
    }

    const dbUser = await getOrCreateUser(
      decodedToken.uid,
      decodedToken.email,
      Boolean(decodedToken.email_verified),
      typeof decodedToken.name === 'string' ? decodedToken.name : undefined
    );

    req.user = decodedToken;
    req.dbUser = dbUser;
    req.isOwner = isOwnerEmail(
      decodedToken.email,
      Boolean(decodedToken.email_verified)
    );
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !req.dbUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!req.isOwner && req.dbUser.role !== 'admin') {
    res.status(403).json({
      error:
        'Administrator access required. Only the platform owner can authorize administrators.'
    });
    return;
  }

  next();
};

export const requireOwner = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !req.dbUser) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (!req.isOwner) {
    res.status(403).json({
      error: 'Only the platform owner can grant or revoke administrator access.'
    });
    return;
  }

  next();
};
