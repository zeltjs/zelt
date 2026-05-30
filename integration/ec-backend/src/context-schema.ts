// Framework issue discovered: RequestContextSchema.user is typed as `unknown`
// and cannot be narrowed via declaration merging (TS2717).
// RequestContextSchema.authRoles is already `readonly string[]`.
// We add EC-specific context keys instead.
declare module '@zeltjs/core' {
  interface RequestContextSchema {
    ecUserId: number;
  }
}

export {};
