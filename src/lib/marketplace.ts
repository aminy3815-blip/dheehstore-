export type CheckoutLine = { productId: string; quantity: number };

export function groupCheckoutItemsByShop(items: CheckoutLine[], shopByProduct: Map<string, string>) {
  const groups = new Map<string, CheckoutLine[]>();
  for (const item of items) {
    const shopId = shopByProduct.get(item.productId);
    if (!shopId) throw new Error('Product is unavailable.');
    groups.set(shopId, [...(groups.get(shopId) ?? []), item]);
  }
  return groups;
}

export function canManageShop(role: string, userId: string, shopOwnerId: string) {
  return role === 'PRODUCER' && userId === shopOwnerId;
}
