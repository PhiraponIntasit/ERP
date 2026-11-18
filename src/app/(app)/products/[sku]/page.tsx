import { notFound } from 'next/navigation';
import { requirePage } from '@/server/auth';
import { catalogOptions, productDetail } from '@/server/products';
import { ProductForm } from '../form';

export default async function EditProductPage({ params }: { params: Promise<{ sku: string }> }) {
  await requirePage('products');
  const { sku } = await params;
  const [product, options] = await Promise.all([productDetail(decodeURIComponent(sku)), catalogOptions()]);
  if (!product) notFound();
  // key: a fresh form after a save that changed the stored values (the server is the source of truth)
  return <ProductForm key={JSON.stringify(product)} product={product} options={options} />;
}
