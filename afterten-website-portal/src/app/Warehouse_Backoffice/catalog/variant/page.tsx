"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function VariantLegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    router.replace(`/Warehouse_Backoffice/catalog/variants${query ? `?${query}` : ""}`);
  }, [router, searchParams]);

  return null;
}

export default function VariantLegacyRedirectPage() {
  return (
    <Suspense fallback={null}>
      <VariantLegacyRedirect />
    </Suspense>
  );
}
