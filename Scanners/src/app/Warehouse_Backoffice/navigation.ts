export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
  tone?: "catalog" | "inventory" | "outlets" | "system" | "default";
};

export const BACKOFFICE_NAV: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/Warehouse_Backoffice" },
      { label: "Middleware Connectivity", href: "/Warehouse_Backoffice/middleware-heartbeat" },
      { label: "Portal/Mintpos Sync", href: "/Warehouse_Backoffice/pos-catalog-sync" },
      { label: "Outlet Live Balances", href: "/Warehouse_Backoffice/outlet-live-balances" },
    ],
    tone: "system",
  },
  {
    label: "Products",
    items: [
      { label: "Add Product", href: "/Warehouse_Backoffice/catalog/product" },
      { label: "Add Groups", href: "/Warehouse_Backoffice/catalog/menu-groups" },
      { label: "Add Variants", href: "/Warehouse_Backoffice/catalog/variants" },
      { label: "Bulk Updates", href: "/Warehouse_Backoffice/variant-bulk-update" },
    ],
    tone: "catalog",
  },
  {
    label: "Inventory",
    items: [{ label: "Purchases", href: "/Warehouse_Backoffice/purchases" }],
    tone: "inventory",
  },
  {
    label: "Outlets",
    items: [
      { label: "Outlet Orders", href: "/Warehouse_Backoffice/outlet-orders" },
      { label: "Sale Deduction Setups", href: "/Warehouse_Backoffice/pos-sale-deductions" },
      { label: "Stocktakes", href: "/Warehouse_Backoffice/stocktakes" },
    ],
    tone: "outlets",
  },
  {
    label: "Reports",
    items: [{ label: "Reports Hub", href: "/Warehouse_Backoffice/reports-hub" }],
    tone: "default",
  },
];

export function pageTitleForPath(pathname: string, hash?: string): string {
  const normalizedHash = hash?.replace(/^#/, "") ?? "";
  for (const group of BACKOFFICE_NAV) {
    for (const item of group.items) {
      const itemPath = item.href.split("#")[0];
      const itemHash = item.href.includes("#") ? item.href.split("#")[1] : "";
      if (pathname === itemPath && (!itemHash || itemHash === normalizedHash)) {
        return item.label;
      }
      if (pathname === item.href || (itemPath !== "/Warehouse_Backoffice" && pathname.startsWith(itemPath))) {
        return item.label;
      }
    }
  }
  if (pathname.startsWith("/Warehouse_Backoffice/catalog/menu")) return "Products";
  if (pathname.startsWith("/Warehouse_Backoffice/purchase-entry")) return "Purchases";
  return "Warehouse Backoffice";
}

export function navGroupLabelClass(tone?: NavGroup["tone"]): string {
  switch (tone) {
    case "catalog":
      return "navGroupLabelCatalog";
    case "inventory":
      return "navGroupLabelInventory";
    case "outlets":
      return "navGroupLabelOutlets";
    case "system":
      return "navGroupLabelSystem";
    default:
      return "";
  }
}
