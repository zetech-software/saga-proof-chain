import { describe, expect, it } from "vitest";
import { escapeCsvCell } from "./csv";

describe("CSV formula neutralization", () => {
  it.each(["=1+1", "+SUM(1;2)", "-1+2", "@SUM(1;2)", "  =1+1", "\t=1+1", "\r\n+1", "\u0000=1"])(
    "exports %j as literal text",
    (name) => expect(escapeCsvCell(name)).toBe(`"'${name}"`),
  );

  it.each(["\tMariana", "\rLéo", "\nNome"])("neutralizes a leading control character in %j", (name) => {
    expect(escapeCsvCell(name)).toBe(`"'${name}"`);
  });

  it("preserves ordinary names, delimiters and embedded quotes", () => {
    expect(escapeCsvCell('Mariana; "Saga"')).toBe('"Mariana; ""Saga"""');
    expect(escapeCsvCell("Léo")).toBe('"Léo"');
    expect(escapeCsvCell("")).toBe('""');
  });
});