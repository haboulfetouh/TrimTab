import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export async function GET() {
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ db: "ok" });
  } catch {
    return NextResponse.json({ db: "unreachable" }, { status: 503 });
  }
}
