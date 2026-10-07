/** @typedef {{x:number, y:number}} Point */
/** Shape-preserving Hermite controls. No extrapolation, overshoot or new data slots.
 * @param {Point[]} points
 */
export function curveSegments(points) {
  if (points.some((p, i) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || i > 0 && p.x <= points[i - 1].x)) throw new Error('invalid_chart_points');
  if (points.length < 2) return [];
  const h = points.slice(1).map((p, i) => p.x - points[i].x);
  const d = points.slice(1).map((p, i) => (p.y - points[i].y) / h[i]);
  const slope = points.map((_, i) => {
    if (i === 0) return d[0];
    if (i === points.length - 1) return d[d.length - 1];
    if (!d[i] || !d[i - 1] || Math.sign(d[i]) !== Math.sign(d[i - 1])) return 0;
    const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1];
    return (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  });
  return points.slice(1).map((to, i) => {
    const from = points[i], dx = h[i] / 3;
    return { from, to, c1: { x: from.x + dx, y: from.y + slope[i] * dx }, c2: { x: to.x - dx, y: to.y - slope[i + 1] * dx } };
  });
}
/** @param {Point[]} points */
export function smoothPath(points) {
  if (!points.length) return '';
  const segments = curveSegments(points);
  return `M${points[0].x},${points[0].y}` + segments.map(s => ` C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.to.x},${s.to.y}`).join('');
}
/** @param {{at:string,value:number|null}[]} rows @param {number} gapMinutes */
export function timeSegments(rows, gapMinutes) {
  const sorted = [...rows].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const counts = new Map();
  for (const row of sorted) counts.set(Date.parse(row.at),(counts.get(Date.parse(row.at)) ?? 0)+1);
  /** @type {{at:string,value:number}[][]} */
  const segments = [];
  /** @type {{at:string,value:number}[]} */
  let current = [];
  for (const row of sorted) {
    const previous = current[current.length-1];
    if (row.value === null || !Number.isFinite(row.value) || !Number.isFinite(Date.parse(row.at)) || counts.get(Date.parse(row.at))!==1) {
      if (current.length) segments.push(current); current=[]; continue;
    }
    if (previous && Date.parse(row.at)-Date.parse(previous.at)>gapMinutes*60000) {segments.push(current);current=[];}
    current.push({at:row.at,value:row.value});
  }
  if (current.length) segments.push(current);
  return segments;
}
