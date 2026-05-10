// packages/contract/src/cli-output.ts

export const cliPrint = (message: string): void => {
  console.log(message);
};

export const cliError = (message: string): void => {
  console.error(message);
};
