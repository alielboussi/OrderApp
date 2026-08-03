import { MIDDLEWARE_HUB_PATH, middlewareTabTitle } from "./middlewareHub";

export type NavItem = {
  label: string;
  href: string;
  adminOnly?: boolean;
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
      { label: "Outlet Orders", href: "/Warehouse_Backoffice/outlet-orders" },
      { label: "Middleware", href: MIDDLEWARE_HUB_PATH },
    ],
    tone: "system",
  },
  {
    label: "Products",
    items: [
      { label: "View Products & Variants", href: "/Warehouse_Backoffice/catalog/menu" },
      { label: "Add Groups", href: "/Warehouse_Backoffice/catalog/menu-groups" },
      { label: "Add Product", href: "/Warehouse_Backoffice/catalog/product" },
      { label: "Add Variants", href: "/Warehouse_Backoffice/catalog/variants" },
      { label: "UOM's", href: "/Warehouse_Backoffice/catalog/uoms" },
      { label: "Bulk Updates", href: "/Warehouse_Backoffice/variant-bulk-update" },
    ],
    tone: "catalog",
  },
  {
    label: "Outlets",
    items: [
      { label: "Create Outlet", href: "/Warehouse_Backoffice/outlets/create" },
      { label: "Outlet Catalog Access", href: "/Warehouse_Backoffice/outlets/catalog-access" },
      { label: "Orders Supervisors", href: "/Warehouse_Backoffice/outlets/supervisors" },
      { label: "Outlets", href: "/Warehouse_Backoffice/outlets" },
    ],
    tone: "outlets",
  },
  {
    label: "Cashiers",
    items: [
      { label: "All Cashiers", href: "/Warehouse_Backoffice/cashiers" },
      { label: "Add Cashier", href: "/Warehouse_Backoffice/cashiers/add" },
      { label: "Delete Cashier", href: "/Warehouse_Backoffice/cashiers/delete" },
    ],
    tone: "outlets",
  },
  {
    label: "Reports",
    items: [
      { label: "Reports Hub", href: "/Warehouse_Backoffice/reports-hub" },
    ],
    tone: "default",
  },
  {
    label: "Account",
    items: [{ label: "Approvals", href: "/Warehouse_Backoffice/account/approvals", adminOnly: true }],
    tone: "system",
  },
  {
    label: "Logs",
    items: [{ label: "User Activity", href: "/Warehouse_Backoffice/logs", adminOnly: true }],
    tone: "system",
  },
];

export function pageTitleForPath(pathname: string, hash?: string): string {
  const normalizedHash = hash?.replace(/^#/, "") ?? "";
  if (pathname === MIDDLEWARE_HUB_PATH) {
    if (normalizedHash) {
      const tabTitle = middlewareTabTitle(normalizedHash);
      if (tabTitle) return tabTitle;
    }
    return "Middleware";
  }
  for (const group of BACKOFFICE_NAV) {
    for (const item of group.items) {
      const itemPath = item.href.split("#")[0];
      const itemHash = item.href.includes("#") ? item.href.split("#")[1] : "";
      if (itemHash) {
        if (pathname === itemPath && itemHash === normalizedHash) return item.label;
        continue;
      }
      if (pathname === itemPath) return item.label;
      if (itemPath !== "/Warehouse_Backoffice" && pathname.startsWith(`${itemPath}/`)) {
        return item.label;
      }
    }
  }
  if (pathname === "/Warehouse_Backoffice/catalog/menu") return "View Products & Variants";
  if (pathname === "/Warehouse_Backoffice/cashiers") return "All Cashiers";
  if (pathname === "/Warehouse_Backoffice/cashiers/add") return "Add Cashier";
  if (pathname === "/Warehouse_Backoffice/cashiers/delete") return "Delete Cashier";
  if (pathname === "/Warehouse_Backoffice/outlets/create") return "Create Outlet";
  if (pathname === "/Warehouse_Backoffice/outlets/catalog-access") return "Outlet Catalog Access";
  if (pathname === "/Warehouse_Backoffice/outlets/supervisors") return "Orders Supervisors";
  if (pathname === "/Warehouse_Backoffice/outlets") return "Outlets";
  if (pathname === "/Warehouse_Backoffice/logs") return "User Activity";
  if (pathname === "/Warehouse_Backoffice/account/approvals") return "Approvals";
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
