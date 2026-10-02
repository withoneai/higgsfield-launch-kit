import { loadFixture } from "./config.js";
import { oneCall } from "./one.js";
import type { Product } from "./types.js";

/**
 * Shopify has no typed module in the One SDK yet, so both reads go through
 * raw passthrough on the Admin GraphQL endpoint. Catalog ids for the platform
 * whose slug is `shopify-admin`. Both are reads: this kit never writes to a
 * store, and `read_products` is the only scope it needs.
 */
const GET_PRODUCT = "conn_mod_def::GKbQic6OiiY::Bne6ZnhjQBODqJfjhnqLJA"; // Get a Product by ID
const LIST_PRODUCTS = "conn_mod_def::GKbQiyxlSRc::ZTlGg0A_Q0q2nYOCUHqDYA"; // List Products
const GRAPHQL_PATH = "/admin/api/2026-04/graphql.json";

const PRODUCT_FIELDS = `
  id
  title
  handle
  description
  featuredMedia { preview { image { url altText } } }
`;

interface RawProduct {
  id: string;
  title: string;
  handle: string;
  description: string;
  featuredMedia?: { preview?: { image?: { url?: string } } } | null;
}

function toProduct(raw: RawProduct | null | undefined, asked: string): Product {
  if (!raw) throw new Error(`Shopify has no product ${asked}.`);
  const imageUrl = raw.featuredMedia?.preview?.image?.url;
  if (!imageUrl) {
    throw new Error(
      `"${raw.title}" has no featured image. The kit keeps the real product in every shot, so it needs a photo to start from.`,
    );
  }
  return {
    id: raw.id,
    title: raw.title,
    handle: raw.handle,
    description: raw.description.trim(),
    imageUrl,
  };
}

function graphqlErrors(res: unknown): void {
  const errors = (res as { errors?: { message: string }[] })?.errors;
  if (errors?.length) throw new Error(`Shopify: ${errors.map((e) => e.message).join("; ")}`);
}

/** Accepts a numeric product id or a full gid://shopify/Product/... id. */
export function toGid(id: string): string {
  return id.startsWith("gid://") ? id : `gid://shopify/Product/${id.replace(/\D/g, "")}`;
}

/**
 * Read one product: the id you pass, or the most recently created one. The
 * fixture is a recorded response for a fictional roaster's new espresso.
 */
export async function readProduct(productId?: string): Promise<Product> {
  if (productId) {
    const res = await oneCall({
      platform: "shopify",
      label: `read product ${productId}`,
      systemId: GET_PRODUCT,
      method: "POST",
      path: GRAPHQL_PATH,
      body: {
        query: `query GetProduct($id: ID!) { product(id: $id) { ${PRODUCT_FIELDS} } }`,
        variables: { id: toGid(productId) },
      },
      fixture: () => {
        const rec = loadFixture("shopify/latest-product.json") as {
          data: { products: { nodes: RawProduct[] } };
        };
        return { data: { product: rec.data.products.nodes[0] } };
      },
    });
    graphqlErrors(res);
    return toProduct((res as { data?: { product?: RawProduct } }).data?.product, productId);
  }

  const res = await oneCall({
    platform: "shopify",
    label: "read the most recently created product",
    systemId: LIST_PRODUCTS,
    method: "POST",
    path: GRAPHQL_PATH,
    body: {
      query: `query Latest { products(first: 1, sortKey: CREATED_AT, reverse: true) { nodes { ${PRODUCT_FIELDS} } } }`,
    },
    fixture: () => loadFixture("shopify/latest-product.json"),
  });
  graphqlErrors(res);
  const nodes = (res as { data?: { products?: { nodes?: RawProduct[] } } }).data?.products?.nodes;
  return toProduct(nodes?.[0], "(the store has no products)");
}
