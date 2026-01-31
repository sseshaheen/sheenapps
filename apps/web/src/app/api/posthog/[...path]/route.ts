/**
 * PostHog Proxy Route - Expert-Recommended Implementation 
 * Fixes forbidden headers, stream body issues, and path parsing
 */

import { NextRequest } from 'next/server'

export const runtime = 'edge'

const HOP_BY_HOP = new Set([
  'host','connection','content-length','accept-encoding','transfer-encoding',
  'via','expect','keep-alive','proxy-authenticate','proxy-authorization','te','upgrade'
])

function buildHeaders(req: NextRequest) {
  const h = new Headers()
  for (const [k, v] of req.headers) if (!HOP_BY_HOP.has(k.toLowerCase())) h.set(k, v)
  return h
}

async function proxy(req: NextRequest, segments: string[]) {
  const inUrl = new URL(req.url)
  const path = segments.filter(Boolean).join('/') // strip empty trailing parts
  const upstream = new URL(`https://eu.i.posthog.com/${path}${inUrl.search}`)

  const method = req.method
  const headers = buildHeaders(req)
  const body =
    method === 'GET' || method === 'HEAD'
      ? undefined
      : await req.arrayBuffer() // compatible in dev + edge

  const res = await fetch(upstream, { method, headers, body, redirect: 'manual', cache: 'no-store' })
  // pipe through unchanged
  return new Response(res.body, { status: res.status, headers: res.headers })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path)
}