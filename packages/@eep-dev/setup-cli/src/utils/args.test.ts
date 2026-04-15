import { describe, expect, it } from "vitest";
import { hasFlag, readFlag } from "./args.js";

describe("args utils", () => {
  it("reads flags and presence checks", () => {
    const argv = ["node", "cli", "--config", "a.json", "--apply"];
    expect(readFlag(argv, "--config")).toBe("a.json");
    expect(readFlag(argv, "--missing")).toBeNull();
    expect(readFlag(["node", "cli", "--config"], "--config")).toBeNull();
    expect(hasFlag(argv, "--apply")).toBe(true);
    expect(hasFlag(argv, "--nope")).toBe(false);
  });
});
