import { NextRequest, NextResponse } from "next/server";
import { runJob, RunOptions } from "@/lib/runner";
import { LogSink } from "@/lib/utils/log";

export const maxDuration = 300; // 5 minutes max for this route

export async function POST(request: NextRequest) {
  try {
    const body: RunOptions = await request.json();

    // Validate request
    if (!body.items || !Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "Invalid request: items array required" },
        { status: 400 }
      );
    }

    // Create a readable stream for streaming logs
    const stream = new ReadableStream({
      async start(controller) {
        const log = new LogSink();
        log.setController(controller);

        try {
          // Run the job
          await runJob(
            {
              items: body.items,
              headful: body.headful || false,
              useOpenAI: body.useOpenAI || false,
            },
            log
          );
        } catch (error) {
          log.error(`Fatal error: ${error}`);
        } finally {
          // Close the stream
          controller.close();
        }
      },
    });

    // Return streaming response
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

