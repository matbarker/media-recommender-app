import { NextResponse } from "next/server";
import { unhideShow } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  unhideShow(parseInt(id, 10));
  return NextResponse.json({ success: true });
}
