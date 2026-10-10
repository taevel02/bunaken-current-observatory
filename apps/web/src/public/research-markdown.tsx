import { Fragment } from "react";

const publicFiles = new Set(["config/geometry.json", "config/model.json", "config/features.json", "config/source-registry.json"]);
function fileUrl(path:string, codeCommit:string) {
  return publicFiles.has(path) ? `https://github.com/taevel02/bunaken-current-observatory/blob/${codeCommit}/${path}` : null;
}
function inline(text:string, codeCommit:string) {
  const parts=[];let offset=0;
  for(const match of text.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+|#[^\s)]*)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https:\/\/[^\s<>]+)|(config\/[a-zA-Z0-9_./-]+)/g)) {
    parts.push(text.slice(offset,match.index));
    const code = match[4] ? <code className="rounded bg-[#edf3f0] px-1">{match[4]}</code> : null;
    const bare = match[5]?.replace(/[.,;:!?]+$/, "");
    const label = match[1] ?? code ?? bare ?? match[6];
    const href = match[2] ?? (match[4] ? fileUrl(match[4],codeCommit) : bare ?? fileUrl(match[6]??"",codeCommit));
    parts.push(href ? <a key={match.index} href={href} className="text-[#155f53] underline [overflow-wrap:anywhere]" rel="noopener noreferrer">{label}</a> : match[3] ? <strong key={match.index}>{match[3]}</strong> : <Fragment key={match.index}>{label}</Fragment>);
    if(bare) parts.push(match[5].slice(bare.length));
    offset=(match.index??0)+match[0].length;
  }
  parts.push(text.slice(offset));return parts;
}
export function ResearchMarkdown({body,codeCommit="main"}:{body:string;codeCommit?:string}) {
  const ref = /^[0-9a-f]{40}$/.test(codeCommit) ? codeCommit : "main";
  const lines=body.split("\n");const blocks=[];
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];if(!line.trim())continue;
    if(line.startsWith("```")) {
      const code=[];while(++i<lines.length&&!lines[i].startsWith("```"))code.push(lines[i]);
      blocks.push(<pre key={i} className="overflow-x-auto rounded bg-[#edf3f0] p-3 text-sm"><code>{code.join("\n")}</code></pre>);continue;
    }
    const heading=/^(#{1,6})\s+(.+)$/.exec(line);
    if(heading) {
      const id=heading[2].toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"");
      blocks.push(heading[1].length<=2?<h2 id={id} key={i} className="mb-2 mt-6 text-xl font-semibold">{inline(heading[2],ref)}</h2>:<h3 id={id} key={i} className="mb-2 mt-4 text-lg font-semibold">{inline(heading[2],ref)}</h3>);continue;
    }
    if(/^\|/.test(line)&&i+1<lines.length&&/^\|?\s*:?-+/.test(lines[i+1])) {
      const cells=(row:string)=>row.replace(/^\||\|$/g,"").split("|").map(cell=>cell.trim());
      const heads=cells(line);i++;const rows=[];
      while(i+1<lines.length&&/^\|/.test(lines[i+1]))rows.push(cells(lines[++i]));
      blocks.push(<div key={i} className="min-w-0 max-w-full overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{heads.map((cell,k)=><th key={k} className="border-b border-[#9aafa7] px-2 py-2">{inline(cell,ref)}</th>)}</tr></thead><tbody>{rows.map((row,k)=><tr key={k}>{row.map((cell,j)=><td key={j} className="border-b border-[#c8d6d0] px-2 py-2 tabular-nums">{inline(cell,ref)}</td>)}</tr>)}</tbody></table></div>);continue;
    }
    if(/^[-*]\s|^\d+\.\s/.test(line)) {
      const ordered=/^\d+\./.test(line);const items=[line.replace(/^[-*]\s|^\d+\.\s/,"")];
      const pattern=ordered?/^\d+\.\s/:/^[-*]\s/;
      while(i+1<lines.length&&pattern.test(lines[i+1]))items.push(lines[++i].replace(pattern,""));
      const children=items.map((item,k)=><li key={k} className="my-1">{inline(item,ref)}</li>);
      blocks.push(ordered?<ol key={i} className="my-3 list-decimal pl-6">{children}</ol>:<ul key={i} className="my-3 list-disc pl-6">{children}</ul>);continue;
    }
    const paragraph=[line];while(i+1<lines.length&&lines[i+1].trim()&&!/^(#{1,6}\s|```|[-*]\s|\d+\.\s|\|)/.test(lines[i+1]))paragraph.push(lines[++i]);
    blocks.push(<p key={i} className="my-3 whitespace-pre-wrap break-words">{inline(paragraph.join("\n"),ref)}</p>);
  }
  return <div className="min-w-0 [overflow-wrap:anywhere]">{blocks.map((block,index)=><Fragment key={index}>{block}</Fragment>)}</div>;
}
