/**
 * DEPRECATED - Voice Transcription API Route
 *
 * This endpoint is no longer used. All voice transcription now goes through
 * the unified /api/v1/transcribe endpoint which handles both hero and project flows.
 *
 * Deprecated: Jan 2026
 * Reason: Unified to single endpoint for consistent DB writes and idempotency
 * Replacement: POST /api/v1/transcribe (with optional projectId in form data)
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // Return 410 Gone with migration instructions
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated',
      message: 'Use POST /api/v1/transcribe with projectId in form data',
      migration: {
        oldEndpoint: `/api/v1/projects/${projectId}/transcribe`,
        newEndpoint: '/api/v1/transcribe',
        changes: [
          'Add recordingId (UUID) to form data for idempotency',
          'Add projectId to form data (determines source="project")',
          'Response field changed from "transcription" to "text"'
        ]
      }
    },
    { status: 410 }
  );
}
