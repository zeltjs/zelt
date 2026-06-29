import type { BuildConfig } from './config/config.types';

const buildArgs = (config: BuildConfig): string[] => {
  const args: string[] = [];

  if (config.entry !== undefined) {
    args.push('--entry', config.entry);
  }

  if (config.outDir !== undefined) {
    args.push('--out-dir', config.outDir);
  }

  if (config.format !== undefined) {
    args.push('--format', config.format);
  }

  if (config.platform !== undefined) {
    args.push('--platform', config.platform);
  }

  if (config.external === true) {
    args.push('--deps.never-bundle', '*');
  }

  args.push('--clean');
  args.push('--no-config');

  return args;
};

const quoteShellArg = (arg: string): string => {
  if (/^[A-Za-z0-9_./:=@%-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\\''")}'`;
};

export const buildTsdownCommand = (config: BuildConfig): string =>
  ['tsdown', ...buildArgs(config).map(quoteShellArg)].join(' ');
