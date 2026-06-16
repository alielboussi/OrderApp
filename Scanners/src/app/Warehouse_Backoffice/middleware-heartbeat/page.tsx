import { redirect } from "next/navigation";

export default function MiddlewareHeartbeatRedirect() {
  redirect("/Warehouse_Backoffice");
}
