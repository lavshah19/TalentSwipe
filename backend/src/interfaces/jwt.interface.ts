
export interface IJwtPayload {
  id: string;
  // standard JWT fields
  iat?: number; // issued at
  exp?: number; // expiration time
}

export interface IRefreshTokenPayload {
  id: string;
}