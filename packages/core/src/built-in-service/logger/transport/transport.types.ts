export type LoggerTransport = {
  write: (formatted: string) => void;
};
