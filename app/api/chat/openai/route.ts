import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"
import { createClient } from "@supabase/supabase-js"

// Run on Node. Embeddings + service role + streaming are happy here.
export const runtime = "nodejs"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  try {
    // Use the same OpenAI client for everything
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")
    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    // Extract last user message text
    const lastUserMessage =
      Array.isArray(messages) && messages.length > 0
        ? [...messages].reverse().find((m: any) => m.role === "user")?.content ?? ""
        : ""

    // ===== RAG: embed + query Supabase (single, reliable path) =====
    let crucibleContext = ""
    let insightCount = 0

    if (lastUserMessage && process.env.ENABLE_CRUCIBLE_RAG === "1") {
      // 1) Embed
      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: lastUserMessage
      })
      const queryEmbedding = emb.data[0].embedding.map(Number)

      // 2) RPC to your table
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
      )

      const { data: insights, error: ragError } = await supabaseAdmin.rpc(
        "search_extraction_insights_v2",
        {
          query_embedding: queryEmbedding,
          match_limit: 20 // raise recall; we’ll let the model summarize
        }
      )

      if (ragError) {
        console.error("Crucible RPC error:", ragError.message)
      }

      if (Array.isArray(insights) && insights.length) {
        insightCount = insights.length

        const trim = (v: any, n: number) => {
          if (!v) return ""
          const s = String(v)
          return s.length > n ? s.slice(0, n - 1) + "…" : s
        }

        const context = insights.map((i: any, idx: number) => {
          const tags = [i.primary_tag, i.secondary_tag, i.tertiary_tag].filter(Boolean).join(" / ")
          return [
            `#${idx + 1} [${tags}] id=${i.id} sim=${(i.similarity ?? 0).toFixed(3)}`,
            `Problem: ${trim(i.problem_statement, 400)}`,
            i.solution_given ? `Solution: ${trim(i.solution_given, 400)}` : "",
            i.implementation_steps ? `Steps: ${trim(i.implementation_steps, 400)}` : "",
            i.financial_impact ? `Impact: ${trim(i.financial_impact, 220)}` : "",
            i.power_quote ? `Quote: ${trim(i.power_quote, 160)}` : "",
            i.business_context ? `Context: ${trim(i.business_context, 220)}` : "",
            i.priority_level ? `Priority: ${i.priority_level}` : ""
          ].filter(Boolean).join("\n")
        }).join("\n\n")

        // Instruction forces operator-grade output
        const instruction =
          "Use the Crucible insights below as primary evidence. " +
          "Return a numbered operator playbook with concrete scripts, KPIs, and first-week actions. " +
          "State assumptions briefly if data is missing. End with 3 risks and what to monitor.\n\n"

        crucibleContext = instruction + "=== CRUCIBLE INSIGHTS BEGIN ===\n" + context + "\n=== CRUCIBLE INSIGHTS END ===\n\n"
      }

      console.log("Crucible RAG included insights:", insightCount)
    } else {
      console.log("Crucible RAG disabled or no user text")
    }
    // ===== end RAG =====

    // Single system message that includes the RAG context
    const systemMessage = {
      role: "system",
      content:
        `${crucibleContext}` +
        `You are a residential home services operator. Be direct and practical. 
Avoid fluff. If the question is vague, ask at most 2 surgical clarifiers, then answer.`
    }

    const modifiedMessages = [systemMessage, ...messages]

    // Stream the chat completion
    const response = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: modifiedMessages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens:
        chatSettings.model === "gpt-4-vision-preview" || chatSettings.model === "gpt-4o"
          ? 4096
          : undefined,
      stream: true
    })

    const stream = OpenAIStream(response)
    return new StreamingTextResponse(stream)
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage = "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage = "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }
    return new Response(JSON.stringify({ message: errorMessage }), { status: errorCode })
  }
}
