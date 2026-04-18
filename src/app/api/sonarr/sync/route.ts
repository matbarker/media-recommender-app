import { NextResponse } from "next/server";
import { executeSonarrSync } from "@/lib/sonarr";

export async function POST() {
  try {
    const res = await executeSonarrSync();
    if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
    return NextResponse.json({ success: true, count: res.count });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
