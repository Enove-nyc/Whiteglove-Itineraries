// A city schedule is not evidence of a completed or outstanding inspection.
export function scheduleFor(record, today = new Date()) {
  const deadline = /\b(20\d{2})\b/.exec(record[10]);
  if (!deadline) return null;
  const base = Number(deadline[1]);
  const year = today.getFullYear();
  const scheduledYear = base + Math.max(0, Math.ceil((year - base) / 4)) * 4;
  return { year: scheduledYear, deadline: `December 31, ${scheduledYear}`, currentYear: scheduledYear === year, publishedCycleDeadline: record[10] };
}
export function candidatesFrom(data) {
  const seen = new Set();
  return (data.features || []).flatMap(f => {
    const p = f.properties || {}, pad = p.addendum?.pad || {}, bin = String(pad.bin || '');
    if (!/^[1-5]\d{6}$/.test(bin) || seen.has(bin)) return [];
    seen.add(bin);
    return [{ bin, bbl: pad.bbl || '', address: p.name || p.label || '', borough: p.borough || p.locality || 'New York City', zip: p.postalcode || '' }];
  }).slice(0, 7);
}
