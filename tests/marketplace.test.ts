import test from 'node:test';
import assert from 'node:assert/strict';
import { canManageShop, groupCheckoutItemsByShop } from '../src/lib/marketplace';
import { canAccessOwner, isDesignatedOwnerEmail } from '../src/lib/owner';

test('checkout divides a shared cart into one order group per shop', () => {
  const groups = groupCheckoutItemsByShop(
    [{ productId: 'coffee', quantity: 2 }, { productId: 'scarf', quantity: 1 }, { productId: 'honey', quantity: 3 }],
    new Map([['coffee', 'shop-a'], ['scarf', 'shop-b'], ['honey', 'shop-a']]),
  );
  assert.deepEqual(groups.get('shop-a'), [{ productId: 'coffee', quantity: 2 }, { productId: 'honey', quantity: 3 }]);
  assert.deepEqual(groups.get('shop-b'), [{ productId: 'scarf', quantity: 1 }]);
});

test('checkout refuses a product missing from the current catalog', () => {
  assert.throws(() => groupCheckoutItemsByShop([{ productId: 'gone', quantity: 1 }], new Map()), /unavailable/);
});

test('only the producer who owns a shop can manage it', () => {
  assert.equal(canManageShop('PRODUCER', 'owner-1', 'owner-1'), true);
  assert.equal(canManageShop('PRODUCER', 'owner-2', 'owner-1'), false);
  assert.equal(canManageShop('CUSTOMER', 'owner-1', 'owner-1'), false);
  assert.equal(canManageShop('ADMIN', 'admin-1', 'owner-1'), false);
});

test('owner provisioning accepts only the designated email, case-insensitively', () => {
  assert.equal(isDesignatedOwnerEmail('aminy3815@gmail.com'), true);
  assert.equal(isDesignatedOwnerEmail('AMINY3815@gmail.com'), true);
  assert.equal(isDesignatedOwnerEmail('someone-else@example.com'), false);
  assert.equal(isDesignatedOwnerEmail(undefined), false);
});

test('owner access requires both the OWNER role and designated email', () => {
  assert.equal(canAccessOwner('OWNER', 'aminy3815@gmail.com'), true);
  assert.equal(canAccessOwner('OWNER', 'another@example.com'), false);
  assert.equal(canAccessOwner('CUSTOMER', 'aminy3815@gmail.com'), false);
  assert.equal(canAccessOwner('ADMIN', 'aminy3815@gmail.com'), false);
});
