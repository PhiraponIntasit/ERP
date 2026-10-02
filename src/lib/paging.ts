/** Page window for a server-paginated table. `raw` comes from the URL; out-of-range pages clamp to the last page. */
export function pageOf(raw: string | undefined, total: number, size: number) {
  const pages = Math.max(1, Math.ceil(total / size));
  const n = Number.parseInt(raw ?? '', 10);
  const page = Math.min(pages, Number.isFinite(n) && n > 0 ? n : 1);
  return { page, pages, total, size, skip: (page - 1) * size };
}
export type Page = ReturnType<typeof pageOf>;
