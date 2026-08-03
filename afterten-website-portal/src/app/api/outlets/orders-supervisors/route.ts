import { NextResponse } from "next/server";
import {
  createFirestoreOrdersSupervisor,
  deleteFirestoreOrdersSupervisor,
  listFirestoreOrdersSupervisors,
  updateFirestoreOrdersSupervisor,
} from "@/lib/firestore-orders-supervisors";
import { requireWarehouseAuth } from "@/lib/warehouse-api-auth";

export async function GET(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const supervisors = await listFirestoreOrdersSupervisors();
    return NextResponse.json({ supervisors, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-supervisors] GET failed", error);
    return NextResponse.json({ error: "Unable to load supervisors" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!name || !email || !password) {
      return NextResponse.json({ error: "name, email and password are required" }, { status: 400 });
    }

    const supervisor = await createFirestoreOrdersSupervisor({ name, email, password });
    return NextResponse.json({ ok: true, supervisor, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-supervisors] POST failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create supervisor" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    const name = body.name !== undefined && body.name !== null ? String(body.name) : undefined;
    const email = body.email !== undefined && body.email !== null ? String(body.email) : undefined;
    const password =
      body.password !== undefined && body.password !== null ? String(body.password) : undefined;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (name === undefined && email === undefined && password === undefined) {
      return NextResponse.json({ error: "name, email or password is required" }, { status: 400 });
    }

    const supervisor = await updateFirestoreOrdersSupervisor({ id, name, email, password });
    return NextResponse.json({ ok: true, supervisor, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-supervisors] PATCH failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to update supervisor" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireWarehouseAuth(request);
  if (!auth.ok) return auth.response;

  try {const body = await request.json().catch(() => ({}));
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    await deleteFirestoreOrdersSupervisor(id);
    return NextResponse.json({ ok: true, cloud_backend: "firebase" });
  } catch (error) {
    console.error("[outlets/orders-supervisors] DELETE failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete supervisor" },
      { status: 500 },
    );
  }
}
