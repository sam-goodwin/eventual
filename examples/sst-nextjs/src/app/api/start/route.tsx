import { client } from "@/server/client";
import { NextResponse } from "next/server";

export default async function handler() {
  const executionHandle = await client.tickTock.startExecution();

  return new NextResponse(
    JSON.stringify({
      executionId: executionHandle.executionId,
    })
  );
}
