export type CliSignal = 'SIGINT' | 'SIGTERM';
export type CliSignalHandler = () => void;

export type CliRuntime = {
  readonly cwd: () => string;
  readonly env: () => NodeJS.ProcessEnv;
  readonly platform: () => NodeJS.Platform;
  readonly writeStdout: (text: string) => void;
  readonly setExitCode: (code: number) => void;
  readonly onSignal: (signal: CliSignal, handler: CliSignalHandler) => void;
  readonly offSignal: (signal: CliSignal, handler: CliSignalHandler) => void;
};

export const nodeCliRuntime: CliRuntime = {
  cwd: () => process.cwd(),
  env: () => process.env,
  platform: () => process.platform,
  writeStdout: (text) => {
    process.stdout.write(text);
  },
  setExitCode: (code) => {
    process.exitCode = code;
  },
  onSignal: (signal, handler) => {
    process.on(signal, handler);
  },
  offSignal: (signal, handler) => {
    process.off(signal, handler);
  },
};
