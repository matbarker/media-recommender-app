import { NextResponse } from "next/server";
import { getAllThreads } from "@/lib/db";

export async function GET() {
  try {
    const threads = getAllThreads();
    return NextResponse.json({ threads });
  } catch (err) {
    console.error("GET /api/threads error:", err);
    return NextResponse.json({ error: "Failed to fetch threads" }, { status: 500 });
  }
}
