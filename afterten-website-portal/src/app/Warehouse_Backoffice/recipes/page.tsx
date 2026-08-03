"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** @deprecated Recipes removed from backoffice */
export default function RecipesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/Warehouse_Backoffice/catalog/menu");
  }, [router]);
  return null;
}
