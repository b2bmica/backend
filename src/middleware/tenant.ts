import type { Request, Response, NextFunction } from 'express';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    hotelId: string;
    role: string;
  };
  hotelId?: string;
}

export const tenantMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  const hotelId = req.user?.hotelId;

  if (!hotelId) {
    return res.status(403).json({
      error: 'Access denied. No tenant context found.',
    });
  }

  // Inject hotelId into the request object for easy access in controllers
  req.hotelId = hotelId;
  next();
};
