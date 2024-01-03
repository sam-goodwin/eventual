import { NextRequest, NextResponse } from "next/server";
import { tickTock } from "@/server/workflow";

export async function POST(req: NextRequest) {
  const executionHandle = await tickTock.startExecution();

  return new NextResponse(
    JSON.stringify({
      executionId: executionHandle.executionId,
    })
  );
}
