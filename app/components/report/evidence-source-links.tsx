import type { CareerSource } from "@/lib/types";

export function EvidenceSourceLinks({ sourceIds, sourceById }: { sourceIds: string[]; sourceById: Map<string, CareerSource> }) {
  if (sourceIds.length === 0) return null;
  const sources = sourceIds.map((id) => sourceById.get(id)).filter((source): source is CareerSource => Boolean(source));
  if (sources.length === 0) return <p className="evidence-source-unavailable">原关联来源暂时无法解析，请以“AI 推断”继续核实。</p>;
  return <div className="evidence-sources"><span>关联来源</span><ul>{sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`查看来源：${source.title}，${source.publisher}，将在新窗口打开`}><strong>{source.title}</strong><small>{source.publisher} ↗</small></a></li>)}</ul></div>;
}
