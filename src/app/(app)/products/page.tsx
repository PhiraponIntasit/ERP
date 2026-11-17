import { requirePage } from '@/server/auth';
import { catalogOptions, productPage, readFilter } from '@/server/products';
import { ProductsView } from './view';

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; cat?: string; brand?: string; status?: string; page?: string }> }) {
  await requirePage('products');
  const sp = await searchParams;
  const filter = readFilter(sp);
  const [{ rows, page, counts }, options] = await Promise.all([productPage(filter, sp.page), catalogOptions()]);
  return <ProductsView rows={rows} page={page} counts={counts} filter={filter} options={options} />;
}
