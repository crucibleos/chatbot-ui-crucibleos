// app/api/retrieval/crucible/route.ts
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

// If your project uses a generated Database type and it complains,
// you can omit the generic or keep it – we cast on the RPC line anyway.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // Use service role here because the RPC needs to run server-side with full access
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const runtime = "nodejs" // embeddings need Node runtime

export async function POST(req: Request) {
  try {
    const { query, limit = 5 } = await req.json()

    if (!query || typeof query !== "string") {
      return NextResponse.json({ error: "Missing 'query' string" }, { status: 400 })
    }

    // 1) Build the embedding
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
    const e = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query
    })
    const embedding = e.data[0].embedding.map(Number) // ensure number[]

    // 2) Call our wire-safe RPC. TypeScript, go sit in the corner.
    const { data, error } = (supabase as any).rpc("search_extraction_insights_v2", {
      query_embedding: embedding,
      match_limit: limit
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const result = await data
    return NextResponse.json({ results: result ?? [] }, { status: 200 })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 })
  }
}
