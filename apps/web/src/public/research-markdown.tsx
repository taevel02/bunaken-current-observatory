import { Fragment } from "react";

function inline(text:string) {
  const parts=[];let offset=0;
  for(const match of text.matchAll(/\[([^\]]+)\]\((https:\/\/[^\s)]+|#[^\s)]*)\)|\*\*([^*]+)\*\*|`([^`]+)`/g)) {
    parts.push(text.slice(offset,match.index));
    parts.push(match[1]?<a key={match.index} href={match[2]} className="text-[#155f53] underline break-words" rel="noopener noreferrer">{match[1]}</a>:match[3]?<strong key={match.index}>{match[3]}</strong>:<code key={match.index} className="rounded bg-[#edf3f0] px-1">{match[4]}</code>);
    offset=(match.index??0)+match[0].length;
  }
  parts.push(text.slice(offset));return parts;
}
export function ResearchMarkdown({body}:{body:string}) {
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
      blocks.push(heading[1].length<=2?<h2 id={id} key={i} className="mb-2 mt-6 text-xl font-semibold">{inline(heading[2])}</h2>:<h3 id={id} key={i} className="mb-2 mt-4 text-lg font-semibold">{inline(heading[2])}</h3>);continue;
    }
    if(/^\|/.test(line)&&i+1<lines.length&&/^\|?\s*:?-+/.test(lines[i+1])) {
      const cells=(row:string)=>row.replace(/^\||\|$/g,"").split("|").map(cell=>cell.trim());
      const heads=cells(line);i++;const rows=[];
      while(i+1<lines.length&&/^\|/.test(lines[i+1]))rows.push(cells(lines[++i]));
      blocks.push(<div key={i} className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm"><thead><tr>{heads.map((cell,k)=><th key={k} className="border-b border-[#9aafa7] px-2 py-2">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row,k)=><tr key={k}>{row.map((cell,j)=><td key={j} className="border-b border-[#c8d6d0] px-2 py-2 tabular-nums">{inline(cell)}</td>)}</tr>)}</tbody></table></div>);continue;
    }
    if(/^[-*]\s|^\d+\.\s/.test(line)) {
      const ordered=/^\d+\./.test(line);const items=[line.replace(/^[-*]\s|^\d+\.\s/,"")];
      const pattern=ordered?/^\d+\.\s/:/^[-*]\s/;
      while(i+1<lines.length&&pattern.test(lines[i+1]))items.push(lines[++i].replace(pattern,""));
      const children=items.map((item,k)=><li key={k} className="my-1">{inline(item)}</li>);
      blocks.push(ordered?<ol key={i} className="my-3 list-decimal pl-6">{children}</ol>:<ul key={i} className="my-3 list-disc pl-6">{children}</ul>);continue;
    }
    const paragraph=[line];while(i+1<lines.length&&lines[i+1].trim()&&!/^(#{1,6}\s|```|[-*]\s|\d+\.\s|\|)/.test(lines[i+1]))paragraph.push(lines[++i]);
    blocks.push(<p key={i} className="my-3 whitespace-pre-wrap break-words">{inline(paragraph.join("\n"))}</p>);
  }
  return <div>{blocks.map((block,index)=><Fragment key={index}>{block}</Fragment>)}</div>;
}
