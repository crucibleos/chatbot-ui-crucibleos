import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database } from "@/supabase/types"
import { createClient } from "@supabase/supabase-js"

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

    const { data: insights, error } = await supabaseAdmin.rpc(
      "search_extraction_insights",
      {
        search_query: userInput,
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
