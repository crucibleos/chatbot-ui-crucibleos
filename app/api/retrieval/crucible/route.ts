import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput } = json as {
    userInput: string
  }

  try {
    // Initialize OpenAI to generate embedding
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!
    })

    // Generate embedding for the user's question
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userInput
    })

    const queryEmbedding = embeddingResponse.data[0].embedding

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Search for similar insights using our new function
    const { data: insights, error } = await supabase.rpc(
      "match_extraction_insights",
      {
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5
      }
    )

    if (error) {
      console.error("Supabase RPC error:", error)
      throw error
    }

    console.log(`✅ Found ${insights?.length || 0} relevant insights for: "${userInput}"`)

    return new Response(JSON.stringify({ results: insights || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    console.error("Error in crucible route:", error)
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
