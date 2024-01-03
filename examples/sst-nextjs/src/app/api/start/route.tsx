import { client } from "@/server/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const executionHandle = await client.tickTock.startExecution();

  return new NextResponse(
    JSON.stringify({
      executionId: executionHandle.executionId,
    })
  );
}
