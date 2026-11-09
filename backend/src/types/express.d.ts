declare global {
  namespace Express {
    interface Request {
      // set by authMiddleware / optionalAuthMiddleware
      user: { id: string };
    }
  }
}

export {};
