import { NextResponse } from "next/server";

const deprecated = { error: "outlet-warehouses API has been retired. Use outlets.default_sales_warehouse_id." };

export function GET() {
  return NextResponse.json(deprecated, { status: 410 });
}

export function POST() {
  return NextResponse.json(deprecated, { status: 410 });
}

export function DELETE() {
  return NextResponse.json(deprecated, { status: 410 });
}
