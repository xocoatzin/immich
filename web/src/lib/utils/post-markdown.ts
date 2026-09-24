/** Pure text-edit helpers for the post composer markdown toolbar. */

export type TextEdit = {
  value: string;
  /** New selection start (cursor). */
  start: number;
  /** New selection end. */
  end: number;
};

/** Wrap the selected range (or a placeholder) with `before`/`after` markers. */
export const wrapSelection = (
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): TextEdit => {
  const selected = value.slice(start, end) || placeholder;
  const next = value.slice(0, start) + before + selected + after + value.slice(end);
  const cursor = start + before.length;
  return { value: next, start: cursor, end: cursor + selected.length };
};

/** Prefix every line intersecting the selected range with `prefix` (idempotent). */
export const prefixLines = (value: string, start: number, end: number, prefix: string): TextEdit => {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEnd = value.indexOf('\n', end);
  const targetEnd = lineEnd === -1 ? value.length : lineEnd;
  const lines = value.slice(lineStart, targetEnd).split('\n');
  const prefixed = lines.map((line) => (line.startsWith(prefix) ? line : prefix + line)).join('\n');
  const next = value.slice(0, lineStart) + prefixed + value.slice(targetEnd);
  return { value: next, start: lineStart, end: lineStart + prefixed.length };
};

/** Turn the selection into a markdown link, placing the cursor on the URL. */
export const insertLink = (value: string, start: number, end: number, placeholder: string): TextEdit => {
  const label = value.slice(start, end) || placeholder;
  const next = `${value.slice(0, start)}[${label}](https://)${value.slice(end)}`;
  const urlStart = start + label.length + 3;
  return { value: next, start: urlStart, end: urlStart + 8 };
};
