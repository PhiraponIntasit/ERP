import { requirePage } from '@/server/auth';
import { catalogOptions } from '@/server/products';
import { CatalogView } from './view';

export default async function CatalogPage() {
  await requirePage('products');
  return <CatalogView options={await catalogOptions()} />;
}
