export type DeviceInfo = {
  userAgent?: string;
  ipAddress?: string;
  browser?: string;
  os?: string;
  device?: string;
};

export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  phone: string | null;
  role: { name: string; permissions: unknown };
}

export interface IAuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}
