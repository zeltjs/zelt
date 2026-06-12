import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { generateGraphqlSdl } from '@zeltjs/graphql';
import { valibotAdapter } from '@zeltjs/validator-valibot/openapi';
import { beforeAll, describe, expect, it } from 'vitest';

import { createGraphqlDogfoodingApp, graphqlRuntimeModule } from '../src/app';

const tsconfig = resolve(__dirname, '../tsconfig.json');
const runtimeModulePath = resolve(__dirname, '..', graphqlRuntimeModule);
const generatedDir = dirname(runtimeModulePath);

const prepareGeneratedRuntime = async (): Promise<void> => {
  await rm(generatedDir, { recursive: true, force: true });
  await mkdir(generatedDir, { recursive: true });

  const app = createGraphqlDogfoodingApp();
  await generateGraphqlSdl(app.http, {
    distDir: generatedDir,
    tsconfig,
    schemaAdapter: valibotAdapter,
    schemaResolver: (modulePath: string) => import(/* @vite-ignore */ modulePath),
  });
};

describe('GraphQL dogfooding app', () => {
  beforeAll(prepareGeneratedRuntime);

  it('runs a storefront workflow through generated GraphQL runtime over HTTP', async () => {
    await expect(readFile(runtimeModulePath, 'utf8')).resolves.toContain(
      'export const graphqlRuntime',
    );
    const schema = await readFile(runtimeModulePath.replace(/\.js$/, '.graphql'), 'utf8');
    expect(schema).toContain('type Query');
    expect(schema).toContain('type Mutation');
    expect(schema).toContain('product(id: String!): ProductPublic');
    expect(schema).toContain('addCartItem(productId: String!, quantity: Int!): CartPublic!');
    expect(schema).toContain('enum ProductPublicStatus');
    expect(schema).toContain('enum CustomerPublicTier');
    expect(schema).toContain('enum OrderPublicStatus');

    const app = createGraphqlDogfoodingApp();
    const runtime = await app.createRuntime();

    const health = await runtime.http.request('/api/health');
    await expect(health.json()).resolves.toEqual({
      app: 'graphql-dogfooding-storefront',
      graphql: '/api/v1/graphql',
      status: 'ok',
    });

    const storefront = await postGraphql(
      runtime,
      `{
      viewer { id name tier }
      categories { slug title }
      catalog { id name category priceCents stock status displayName availabilityLabel }
      featuredProducts { id name status availabilityLabel }
      cart { id items { productId quantity unitPriceCents product { id name } lineTotalCents } totalQuantity subtotalCents shippingEstimateCents grandTotalCents }
      orderHistory { id status itemCount totalCents }
    }`,
    );

    expect(storefront.status).toBe(200);
    await expect(storefront.json()).resolves.toEqual({
      data: {
        viewer: { id: 'customer_1', name: 'Ada Lovelace', tier: 'VIP' },
        categories: [
          { slug: 'LIGHTING', title: 'Lighting' },
          { slug: 'STATIONERY', title: 'Stationery' },
          { slug: 'STORAGE', title: 'Storage' },
        ],
        catalog: [
          {
            id: 'p_lamp',
            name: 'Desk Lamp',
            category: 'LIGHTING',
            priceCents: 12900,
            stock: 7,
            status: 'AVAILABLE',
            displayName: 'Desk Lamp - Lighting',
            availabilityLabel: 'Ready to ship',
          },
          {
            id: 'p_notebook',
            name: 'Notebook Set',
            category: 'STATIONERY',
            priceCents: 2400,
            stock: 3,
            status: 'LOW_STOCK',
            displayName: 'Notebook Set - Stationery',
            availabilityLabel: 'Only 3 left',
          },
          {
            id: 'p_archive_box',
            name: 'Archive Box',
            category: 'STORAGE',
            priceCents: 1800,
            stock: 0,
            status: 'SOLD_OUT',
            displayName: 'Archive Box - Storage',
            availabilityLabel: 'Sold out',
          },
        ],
        featuredProducts: [
          {
            id: 'p_lamp',
            name: 'Desk Lamp',
            status: 'AVAILABLE',
            availabilityLabel: 'Ready to ship',
          },
          {
            id: 'p_notebook',
            name: 'Notebook Set',
            status: 'LOW_STOCK',
            availabilityLabel: 'Only 3 left',
          },
        ],
        cart: {
          id: 'cart_customer_1',
          items: [],
          totalQuantity: 0,
          subtotalCents: 0,
          shippingEstimateCents: 0,
          grandTotalCents: 0,
        },
        orderHistory: [],
      },
    });

    const cartMutation = await postGraphql(
      runtime,
      `mutation {
      addFeaturedBundleToCart {
        id
        items { productId quantity unitPriceCents product { id name } lineTotalCents }
        totalQuantity
        subtotalCents
        shippingEstimateCents
        grandTotalCents
      }
    }`,
    );

    expect(cartMutation.status).toBe(200);
    await expect(cartMutation.json()).resolves.toEqual({
      data: {
        addFeaturedBundleToCart: {
          id: 'cart_customer_1',
          items: [
            {
              productId: 'p_lamp',
              quantity: 1,
              unitPriceCents: 12900,
              product: { id: 'p_lamp', name: 'Desk Lamp' },
              lineTotalCents: 12900,
            },
            {
              productId: 'p_notebook',
              quantity: 2,
              unitPriceCents: 2400,
              product: { id: 'p_notebook', name: 'Notebook Set' },
              lineTotalCents: 4800,
            },
          ],
          totalQuantity: 3,
          subtotalCents: 17700,
          shippingEstimateCents: 0,
          grandTotalCents: 17700,
        },
      },
    });

    const checkout = await postGraphql(
      runtime,
      `mutation {
      checkoutCart {
        id
        status
        itemCount
        totalCents
        items { productId quantity unitPriceCents lineTotalCents }
      }
    }`,
    );

    expect(checkout.status).toBe(200);
    await expect(checkout.json()).resolves.toEqual({
      data: {
        checkoutCart: {
          id: 'order_1',
          status: 'CONFIRMED',
          itemCount: 3,
          totalCents: 17700,
          items: [
            {
              productId: 'p_lamp',
              quantity: 1,
              unitPriceCents: 12900,
              lineTotalCents: 12900,
            },
            {
              productId: 'p_notebook',
              quantity: 2,
              unitPriceCents: 2400,
              lineTotalCents: 4800,
            },
          ],
        },
      },
    });

    const afterCheckout = await postGraphql(
      runtime,
      `{
      cart { items { productId } totalQuantity grandTotalCents }
      orderHistory { id status itemCount totalCents }
    }`,
    );

    expect(afterCheckout.status).toBe(200);
    await expect(afterCheckout.json()).resolves.toEqual({
      data: {
        cart: { items: [], totalQuantity: 0, grandTotalCents: 0 },
        orderHistory: [{ id: 'order_1', status: 'CONFIRMED', itemCount: 3, totalCents: 17700 }],
      },
    });
  });

  it('validates field args through gqlValidated on queries and mutations', async () => {
    const app = createGraphqlDogfoodingApp();
    const runtime = await app.createRuntime();

    const found = await postGraphql(runtime, `{ product(id: "p_lamp") { id name priceCents } }`);
    expect(found.status).toBe(200);
    await expect(found.json()).resolves.toEqual({
      data: { product: { id: 'p_lamp', name: 'Desk Lamp', priceCents: 12900 } },
    });

    const missing = await postGraphql(runtime, `{ product(id: "p_unknown") { id } }`);
    await expect(missing.json()).resolves.toEqual({ data: { product: null } });

    const emptyCheckout = await postGraphql(runtime, `mutation { checkoutCart { id } }`);
    const emptyCheckoutBody: { data: unknown; errors?: readonly { message: string }[] } =
      await emptyCheckout.json();
    expect(emptyCheckoutBody.data).toBeNull();
    expect(emptyCheckoutBody.errors?.[0]?.message).toMatch(/cart is empty/i);

    const added = await postGraphql(
      runtime,
      `mutation {
      addCartItem(productId: "p_notebook", quantity: 2) {
        items { productId quantity }
        totalQuantity
      }
    }`,
    );
    expect(added.status).toBe(200);
    await expect(added.json()).resolves.toEqual({
      data: {
        addCartItem: {
          items: [{ productId: 'p_notebook', quantity: 2 }],
          totalQuantity: 2,
        },
      },
    });

    const invalid = await postGraphql(
      runtime,
      `mutation { addCartItem(productId: "p_notebook", quantity: 0) { totalQuantity } }`,
    );
    const invalidBody: { data: unknown; errors?: readonly { message: string }[] } =
      await invalid.json();
    expect(invalidBody.data).toBeNull();
    expect(invalidBody.errors?.[0]?.message).toMatch(/validation failed/i);
  });
});

const postGraphql = (
  runtime: Awaited<ReturnType<ReturnType<typeof createGraphqlDogfoodingApp>['createRuntime']>>,
  query: string,
): Promise<Response> =>
  runtime.http.request('/api/v1/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query }),
  });
