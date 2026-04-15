export function readFlag(argv: string[], name: string): string | null {
  const idx = argv.indexOf(name);
  if (idx < 0) {
    return null;
  }
  return argv[idx + 1] ?? null;
}

export function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}
