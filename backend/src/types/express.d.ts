import "express";

declare global {
  namespace Express {
    interface Request {
      // Set by requireAuth (always) and optionalAuth (when a valid token is sent).
      userId: string;
    }
  }
}
