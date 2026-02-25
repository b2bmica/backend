import jwt from 'jsonwebtoken';
import type { Response, NextFunction } from 'express';
import type { AuthRequest } from './tenant.js';

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorized, no token' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Not authorized, token missing' });
  }

  try {
    const secret = process.env.JWT_SECRET || 'secret';
    const decoded = jwt.verify(token, secret) as any;
    req.user = {
      userId: decoded.userId,
      hotelId: decoded.hotelId,
      role: decoded.role,
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Not authorized, token invalid' });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Role '${req.user?.role}' is not authorized to access this route`,
      });
    }
    next();
  };
};
