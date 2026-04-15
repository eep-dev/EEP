export type CommandContext = {
  argv: string[];
  cwd: string;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
};

export type CommandResult = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
};
