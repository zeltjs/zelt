export interface JwtPayload {
  sub?: string;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}
