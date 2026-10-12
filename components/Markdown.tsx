import React from "react";

const safeHref = (url: string) => (/^(https?:\/\/|mailto:|tel:)/i.test(url) ? url : undefined);
const safeImg = (src: string) => (/^data:image\/(png|jpe?g);base64,/i.test(src.replace(/\s+/g, "")) ? src.replace(/(base64,)\s+/i, "$1") : undefined);

/** Inline: **bold**, *italic*, ~~strike~~, [text](url) */
export function inline(text: string, key = "i"): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|~~([^~]+)~~|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0, m: RegExpExecArray | null, n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[2] !== undefined) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3] !== undefined) out.push(<s key={k}>{inline(m[3], k)}</s>);
    else if (m[4] !== undefined) out.push(<em key={k}>{inline(m[4], k)}</em>);
    else { const href = safeHref(m[6]); out.push(href ? <a key={k} href={href} target="_blank" rel="noopener noreferrer">{m[5]}</a> : <span key={k}>{m[5]}</span>); }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Block-level markdown used by RichText (headings h1/h2, lists, tables, images, paragraphs). */
export function RichMarkdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { blocks.push(h[1].length === 1 ? <h3 key={k++} className="fr-heading">{inline(h[2])}</h3> : h[1].length === 2 ? <h4 key={k++} className="fr-subheading">{inline(h[2])}</h4> : <p key={k++} className="fr-body">{inline(h[2])}</p>); i++; continue; }
    const img = line.match(/^!\[([^\]]*)\]\((.+)\)\s*$/);
    if (img) { const src = safeImg(img[2]); if (src) blocks.push(<img key={k++} className="fr-image" alt={img[1]} src={src} />); i++; continue; }
    if (/^\s*\|/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "")) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(line); i += 2; const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(<table key={k++} className="fr-table"><thead><tr>{head.map((c, x) => <th key={x}>{inline(c)}</th>)}</tr></thead><tbody>{rows.map((r, y) => <tr key={y}>{r.map((c, x) => <td key={x}>{inline(c)}</td>)}</tr>)}</tbody></table>);
      continue;
    }
    if (/^\s*([+*-]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line); const items: string[] = [];
      while (i < lines.length && /^\s*([+*-]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([+*-]|\d+\.)\s+/, ""));
      const li = items.map((t, x) => <li key={x}>{inline(t)}</li>);
      blocks.push(ordered ? <ol key={k++} className="fr-list">{li}</ol> : <ul key={k++} className="fr-list">{li}</ul>); continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*\||\s*([+*-]|\d+\.)\s+|!\[)/.test(lines[i])) para.push(lines[i++]);
    if (para.length) blocks.push(<p key={k++} className="fr-body">{inline(para.join(" "))}</p>); else i++;
  }
  return <>{blocks}</>;
}
