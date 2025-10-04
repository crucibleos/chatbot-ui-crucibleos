import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"
import OpenAI from "openai"

export async function POST(request: Request) {
  const json = await request.json()
  const { userInput } = json as {
    userInput: string
  }

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    // Check API key based on Azure or regular OpenAI
    if (profile.use_azure_openai) {
      checkApiKey(profile.azure_openai_api_key, "Azure OpenAI")
    } else {
      checkApiKey(profile.openai_api_key, "OpenAI")
    }

    // Initialize OpenAI client
    let openai
    if (profile.use_azure_openai) {
      openai = new OpenAI({
        apiKey: profile.azure_openai_api_key || "",
        baseURL: `${profile.azure_openai_endpoint}/openai/deployments/${profile.azure_openai_embeddings_id}`,
        defaultQuery: { "api-version": "2023-12-01-preview" },
        defaultHeaders: { "api-key": profile.azure_openai_api_key }
      })
    } else {
      openai = new OpenAI({
        apiKey: profile.openai_api_key || "",
        organization: profile.openai_organization_id
      })
    }

    // Generate embedding from user query
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: userInput
    })

    const queryEmbedding = response.data[0].embedding

    // Search extraction insights using vector similarity
    const { data: insights, error } = await supabaseAdmin.rpc(
      "search_extraction_insights",
      {
        query_embedding: queryEmbedding as any,
        match_limit: 5
      }
    )

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({ results: insights || [] }), {
      status: 200
    })
  } catch (error: any) {
    const errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
