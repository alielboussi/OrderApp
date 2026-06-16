"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function PurchaseEntryRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/Warehouse_Backoffice/purchases");
  }, [router]);
  return null;
}
