import readline from "node:readline/promises";

export interface Confirmer {
  confirm(question: string): Promise<boolean>;
}

export const autoApproveConfirmer: Confirmer = {
  async confirm(): Promise<boolean> {
    return true;
  },
};

export const denyAllConfirmer: Confirmer = {
  async confirm(): Promise<boolean> {
    return false;
  },
};

export function createInteractiveConfirmer(
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Confirmer {
  return {
    async confirm(question: string): Promise<boolean> {
      if (input === process.stdin && !process.stdin.isTTY) {
        return false;
      }
      const rl = readline.createInterface({ input, output });
      try {
        const answer = await rl.question(`${question} [y/N] `);
        return /^y(es)?$/i.test(answer.trim());
      } finally {
        rl.close();
      }
    },
  };
}
