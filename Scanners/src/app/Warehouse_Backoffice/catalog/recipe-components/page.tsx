"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RecipeComponentsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/Warehouse_Backoffice/catalog/menu");
  }, [router]);
  return null;
}
