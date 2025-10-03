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

    // Call Supabase REST API directly (bypasses PostgREST issues)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/match_extraction_insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        query_embedding: queryEmbedding,
        match_threshold: 0.7,
        match_count: 5
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Supabase error:', errorText)
      throw new Error(`Supabase RPC failed: ${response.status} - ${errorText}`)
    }

    const insights = await response.json()

    console.log(`✅ Found ${insights?.length || 0} relevant insights for: "${userInput}"`)

    return new Response(JSON.stringify({ results: insights || [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  } catch (error: any) {
    console.error("Error in crucible route:", error)
    const errorMessage = error.message || "An unexpected error occurred"
    return new Response(JSON.stringify({ 
      message: errorMessage,
      error: error.toString() 
    }), {
      status: 500
    })
  }
}
