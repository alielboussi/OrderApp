"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { middlewareTabHref, type MiddlewareHubView } from "./middlewareHub";

type LegacyMiddlewareTab = MiddlewareHubView | "connectivity" | "outlet-push" | "catalog-sync";

type RedirectToMiddlewareTabProps = {
  tab: LegacyMiddlewareTab;
};

function resolveView(tab: LegacyMiddlewareTab): MiddlewareHubView {
  if (tab === "failures") return "failures";
  return "main";
}

export default function RedirectToMiddlewareTab({ tab }: RedirectToMiddlewareTabProps) {
  const router = useRouter();

  useEffect(() => {
    router.replace(middlewareTabHref(resolveView(tab)));
  }, [router, tab]);

  return null;
}
