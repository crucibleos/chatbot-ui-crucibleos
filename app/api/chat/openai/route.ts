import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"

export const runtime: ServerRuntime = "edge"

export async function POST(request: Request) {
  const json = await request.json()
  const { chatSettings, messages } = json as {
    chatSettings: ChatSettings
    messages: any[]
  }

  try {
    const profile = await getServerProfile()

    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    // Get the last user message
    const lastUserMessage = messages[messages.length - 1]?.content || ""

    // Search Crucible insights
    let crucibleContext = ""
    try {
      const crucibleResponse = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/retrieval/crucible`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ userInput: lastUserMessage })
        }
      )

      if (crucibleResponse.ok) {
        const { results } = await crucibleResponse.json()
        if (results && results.length > 0) {
          crucibleContext = "\n\n=== CRUCIBLE KNOWLEDGE BASE ===\n"
          results.forEach((insight: any, index: number) => {
            crucibleContext += `\n[Insight ${index + 1}]`
            crucibleContext += `\nCategory: ${insight.primary_tag} → ${insight.secondary_tag} → ${insight.tertiary_tag}`
            crucibleContext += `\nProblem: ${insight.problem_statement}`
            if (insight.solution_given) crucibleContext += `\nSolution: ${insight.solution_given}`
            if (insight.implementation_steps) crucibleContext += `\nSteps: ${insight.implementation_steps}`
            if (insight.financial_impact) crucibleContext += `\nFinancial Impact: ${insight.financial_impact}`
            if (insight.power_quote) crucibleContext += `\nKey Quote: "${insight.power_quote}"`
            crucibleContext += "\n"
          })
        }
      }
    } catch (error) {
      console.error("Error fetching Crucible insights:", error)
    }

    // Add system message with Crucible context and Socratic instructions
    const systemMessage = {
      role: "system",
      content: `You are a specialized AI coach for the residential home services industry, based on 20 years of industry expertise and the Crucible Audit framework.

CORE BEHAVIOR - SOCRATIC METHOD WITH EDGE:
- NEVER give multi-paragraph answers
- NEVER assume you know what the user is asking about
- Ask sharp, clarifying questions that force the user to think deeper
- Be direct and no-nonsense - like the best operators and consultants
- Get to the root cause, uncover insights, attack money left on the table
- Focus on throughput through dependent events and statistical fluctuations

RESPONSE STYLE:
- Keep responses to 1-3 sentences MAX
- Ask ONE targeted question at a time
- Challenge assumptions
- Drive toward actionable insights

When the user asks something vague like "How do I increase revenue?", respond with something like:
"Revenue is a result. What's the constraint? Is it your call booking rate, average ticket, conversion rate, or something else in your operation?"

${crucibleContext}

If Crucible insights are provided above, use them to inform your questions and guidance, but still maintain the Socratic approach.`
    }

    const modifiedMessages = [systemMessage, ...messages]

    const response = await openai.chat.completions.create({
      model: chatSettings.model as ChatCompletionCreateParamsBase["model"],
      messages: modifiedMessages as ChatCompletionCreateParamsBase["messages"],
      temperature: chatSettings.temperature,
      max_tokens:
        chatSettings.model === "gpt-4-vision-preview" ||
        chatSettings.model === "gpt-4o"
          ? 4096
          : null,
      stream: true
    })

    const stream = OpenAIStream(response)

    return new StreamingTextResponse(stream)
  } catch (error: any) {
    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
