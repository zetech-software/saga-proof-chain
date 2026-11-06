/** Quote a CSV cell and force formula-like values to remain literal text. */
export function escapeCsvCell(value: string): string {
  // Check past leading whitespace/control characters without changing the name.
  const formulaLike = /^[\s\u0000-\u001f\u007f]*[=+\-@]/u.test(value);
  const text = formulaLike || /^[\t\r\n]/u.test(value) ? `'${value}` : value;
  return `"${text.replace(/"/g, '""')}"`;
}