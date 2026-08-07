import {
  listFirestoreCatalogItems,
  listFirestoreCatalogVariants,
} from "@/lib/firestore-catalog-store";
import { fetchStockCatalog } from "@/lib/stock-api-client";
import { rowLinkedToApiUuid, isPortalOnlyCatalogItem } from "@/lib/catalog-api-sync-matching";

export type CatalogApiAlignment = {
  api_product_count: number;
  portal_products_linked: number;
  portal_variants_linked: number;
  portal_products_total: number;
  portal_variants_total: number;
  portal_products_extra: number;
  portal_variants_extra: number;
  aligned: boolean;
};

export async function getCatalogApiAlignment(): Promise<CatalogApiAlignment> {
  const [catalog, items, variants] = await Promise.all([
    fetchStockCatalog(),
    listFirestoreCatalogItems(),
    listFirestoreCatalogVariants({ activeOnly: false }),
  ]);

  const apiProducts = (catalog.products ?? []).filter((product) => String(product.uuid ?? "").trim());
  const apiUuidSet = new Set(apiProducts.map((product) => String(product.uuid).trim()));

  const apiManagedItems = items.filter((item) => !isPortalOnlyCatalogItem(item));
  const apiManagedVariants = variants.filter((variant) => {
    const parent = items.find((item) => String(item.id ?? "") === String(variant.item_id ?? ""));
    return parent ? !isPortalOnlyCatalogItem(parent) : false;
  });

  const portalProductsLinked = apiManagedItems.filter((item) =>
    rowLinkedToApiUuid(String(item.id ?? ""), item.stock_api_uuid, apiUuidSet),
  );
  const portalVariantsLinked = apiManagedVariants.filter((variant) =>
    rowLinkedToApiUuid(String(variant.id ?? ""), variant.stock_api_uuid, apiUuidSet),
  );

  const portalProductsExtra = apiManagedItems.length - portalProductsLinked.length;
  const portalVariantsExtra = apiManagedVariants.length - portalVariantsLinked.length;
  const linkedTotal = portalProductsLinked.length + portalVariantsLinked.length;
  const apiCount = catalog.productCount ?? apiProducts.length;

  return {
    api_product_count: apiCount,
    portal_products_linked: portalProductsLinked.length,
    portal_variants_linked: portalVariantsLinked.length,
    portal_products_total: apiManagedItems.length,
    portal_variants_total: apiManagedVariants.length,
    portal_products_extra: portalProductsExtra,
    portal_variants_extra: portalVariantsExtra,
    aligned:
      linkedTotal === apiCount &&
      portalProductsExtra === 0 &&
      portalVariantsExtra === 0,
  };
}
