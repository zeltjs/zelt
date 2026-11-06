export const readOwnEntry = <T>(
  entries: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined => {
  if (entries === undefined || Object.getOwnPropertyDescriptor(entries, key) === undefined) {
    return undefined;
  }
  return entries[key];
};
