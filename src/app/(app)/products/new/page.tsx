import { requirePage } from '@/server/auth';
import { catalogOptions } from '@/server/products';
import { ProductForm } from '../form';

export default async function NewProductPage() {
  await requirePage('products');
  return <ProductForm options={await catalogOptions()} />;
}
