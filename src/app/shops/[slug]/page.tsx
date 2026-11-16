import { db } from '@/lib/db';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await db.shop.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      description: true,
      verified: true,
      status: true,
      products: {
        where: { available: true, stock: { gt: 0 } },
        select: {
          id: true,
          name: true,
          imageUrl: true,
          featured: true,
          price: true,
          compareAtPrice: true,
          shop: { select: { name: true, slug: true, city: true, verified: true } },
          category: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
  if (!shop || shop.status !== 'APPROVED') notFound();
  return <main className="wrap pageContent">
    <div className="shopHero">
      <div className="shopAvatar large">{shop.name.slice(0, 1)}</div>
      <div><div className="eyebrow">{shop.city} · LOCAL SHOP</div><h1>{shop.name}{shop.verified && <span className="verified">✓</span>}</h1><p>{shop.description}</p></div>
    </div>
    <div className="sectionIntro"><div><h2>Shop listings</h2></div><span>{shop.products.length} products</span></div>
    <div className="productGrid">{shop.products.map((product) => <ProductCard key={product.id} p={product}/>)}</div>
  </main>;
}
