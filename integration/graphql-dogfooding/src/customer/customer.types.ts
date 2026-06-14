export type CustomerTier = 'member' | 'vip';

export type CustomerPublic = {
  readonly id: string;
  readonly name: string;
  readonly tier: CustomerTier;
};
