"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { logWarehouseAction } from "./logging";
import BackofficeShell from "./BackofficeShell";
import "./backoffice-globals.css";

export default function WarehouseBackofficeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const comboArmedAt = useRef<number | null>(null);
  const isLogin = pathname === "/Warehouse_Backoffice/login";

  useEffect(() => {
    if (!pathname || isLogin) return;
    logWarehouseAction({ action: "view", page: pathname });
  }, [pathname, isLogin]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as unknown as { __wbFetchPatched?: boolean; __wbOriginalFetch?: typeof fetch };
    if (!win.__wbFetchPatched) {
      win.__wbOriginalFetch = window.fetch.bind(window);
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : (input as Request).url;
        const method = init?.method?.toUpperCase?.() ?? "GET";
        const isWarehouse = url.includes("/Warehouse_Backoffice") || url.includes("/api/");
        const res = await win.__wbOriginalFetch!(input, init);
        if (isWarehouse && method !== "GET") {
          logWarehouseAction({
            action: "request",
            page: pathname ?? null,
            method,
            status: res.status,
            details: { url },
          });
        }
        return res;
      };
      win.__wbFetchPatched = true;
    }
  }, [pathname]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.altKey && event.code === "Space") {
        comboArmedAt.current = Date.now();
        return;
      }
      if (event.key.toLowerCase() === "x" && comboArmedAt.current) {
        const withinWindow = Date.now() - comboArmedAt.current < 1500;
        comboArmedAt.current = null;
        if (withinWindow) {
          router.push("/Warehouse_Backoffice/logs");
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [router]);

  if (isLogin) {
    return <>{children}</>;
  }

  return <BackofficeShell>{children}</BackofficeShell>;
}
