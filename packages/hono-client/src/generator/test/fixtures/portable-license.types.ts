export type ValidateSuccess =
  | { status: 'valid'; readonly payload: string; readonly signature: string }
  | { status: 'revoked' };
