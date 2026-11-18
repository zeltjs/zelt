// Only a line of the opening character, at least as long as the opening fence, closes a block,
// so code may show shorter fences. The language is the first word of the info string, as in
// the rendered page. As in CommonMark, a fence is indented by at most three spaces; a deeper line
// is content. Indented code blocks and containers are out of scope for the guides.
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

const fenceOf = (line: string) => {
  const match = FENCE.exec(line.replace(/\r$/, ''));
  if (!match) return undefined;
  const [, marker = '', info = ''] = match;
  return { marker, info: info.trim() };
};

const closes = (line: string, opening: string): boolean => {
  const fence = fenceOf(line);
  return (
    fence !== undefined &&
    fence.info === '' &&
    fence.marker[0] === opening[0] &&
    fence.marker.length >= opening.length
  );
};

export const codeFences = (markdown: string, lang: string): readonly string[] => {
  const blocks: string[] = [];
  let open:
    | { readonly marker: string; readonly wanted: boolean; readonly lines: string[] }
    | undefined;
  for (const line of markdown.replace(/\n$/, '').split('\n')) {
    if (open === undefined) {
      const fence = fenceOf(line);
      // A backtick fence's info string cannot contain backticks; such a line is inline code.
      if (fence && !(fence.marker.startsWith('`') && fence.info.includes('`')))
        open = { marker: fence.marker, wanted: fence.info.split(/\s+/)[0] === lang, lines: [] };
    } else if (closes(line, open.marker)) {
      if (open.wanted) blocks.push(open.lines.map((code) => `${code}\n`).join(''));
      open = undefined;
    } else {
      open.lines.push(line);
    }
  }
  // An unclosed fence runs to the end of the document.
  if (open?.wanted) blocks.push(open.lines.map((code) => `${code}\n`).join(''));
  return blocks;
};
