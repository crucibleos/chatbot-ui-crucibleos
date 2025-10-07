import { checkApiKey, getServerProfile } from "@/lib/server/server-chat-helpers"
import { ChatSettings } from "@/types"
import { OpenAIStream, StreamingTextResponse } from "ai"
import { ServerRuntime } from "next"
import OpenAI from "openai"
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs"
import { createClient } from "@supabase/supabase-js"

export const runtime: ServerRuntime = "edge" // Consider Node runtime if using service role key

export async function POST(request: Request) {
  const json = await request.json()
  // ====== CRUCIBLE RAG INJECTION (BEGIN) ======
try {
  // Kill switch from env, so you can turn this on/off in Vercel
  if (process.env.ENABLE_CRUCIBLE_RAG === "1") {
    // 1) Pull the last user message text
    const body: any = json ?? {};
    const lastUserMsg =
      Array.isArray(body.messages)
        ? [...body.messages].reverse().find((m: any) => m.role === "user")?.content ?? ""
        : body.userInput || body.input || body.query || "";

    if (typeof lastUserMsg === "string" && lastUserMsg.trim().length > 0) {
      // 2) Build embedding
      const openaiForEmb = new (require("openai")).default({ apiKey: process.env.OPENAI_API_KEY! });
      const emb = await openaiForEmb.embeddings.create({
        model: "text-embedding-3-small",
        input: lastUserMsg
      });
      const queryEmbedding = emb.data[0].embedding.map(Number);

      // 3) Fetch top insights
      const { createClient } = require("@supabase/supabase-js");
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY! // server-side only
      );
      const { data: insights, error: ragError } = await supabaseAdmin.rpc(
        "search_extraction_insights_v2",
        { query_embedding: queryEmbedding, match_limit: 12 }
      );
      if (ragError) console.error("Crucible RPC error:", ragError.message);

      // Helper to trim long fields
      const trim = (v: any, n: number) => {
        if (!v) return "";
        const s = String(v);
        return s.length > n ? s.slice(0, n - 1) + "…" : s;
      };

      // 4) Prepend structured context with real instructions
      if (Array.isArray(body.messages) && (insights?.length ?? 0) > 0) {
        const context = insights.map((i: any, idx: number) => {
          const tags = [i.primary_tag, i.secondary_tag, i.tertiary_tag].filter(Boolean).join(" / ");
          return [
            `#${idx + 1} [${tags}] id=${i.id} sim=${i.similarity.toFixed(3)}`,
            `Problem: ${trim(i.problem_statement, 350)}`,
            `Solution: ${trim(i.solution_given, 350)}`,
            i.implementation_steps ? `Steps: ${trim(i.implementation_steps, 350)}` : "",
            i.financial_impact ? `Impact: ${trim(i.financial_impact, 200)}` : "",
            i.power_quote ? `Quote: ${trim(i.power_quote, 160)}` : "",
            i.business_context ? `Context: ${trim(i.business_context, 200)}` : "",
            i.priority_level ? `Priority: ${i.priority_level}` : ""
          ].filter(Boolean).join("\n");
        }).join("\n\n");

        const instruction =
          "You are a residential home services operator. Use the Crucible insights below as primary evidence. " +
          "Return a practical, detailed answer with a numbered playbook, concrete scripts, and expected metrics. " +
          "Prefer specifics over fluff. If something is missing, state the assumption and continue.\n\n";

        body.messages = [
          {
            role: "system",
            content: instruction + "=== CRUCIBLE INSIGHTS BEGIN ===\n" + context + "\n=== CRUCIBLE INSIGHTS END ==="
          },
          ...body.messages
        ];

        // write back to json so the downstream OpenAI call sees it
        Object.assign(json, body);

        console.log("Crucible RAG included insights:", insights.length);
      } else {
        console.log("Crucible RAG: no insights returned");
      }
    } else {
      console.log("Crucible RAG: no user text found");
    }
  } else {
    console.log("Crucible RAG disabled (ENABLE_CRUCIBLE_RAG != 1)");
  }
} catch (e: any) {
  console.error("Crucible RAG injection error:", e?.message || e);
}
// ====== CRUCIBLE RAG INJECTION (END) ======

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

    // 1) Last user message, every time
    const lastUserMessage =
      Array.isArray(messages) && messages.length > 0
        ? messages.slice().reverse().find((m: any) => m.role === "user")?.content ?? ""
        : ""

    // 2) Always-on RAG: embed and hit Supabase RPC
    let crucibleInlineInsights = ""
    if (lastUserMessage) {
      try {
        const emb = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: lastUserMessage
        })
        const queryEmbedding = emb.data[0].embedding.map(Number)

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRole)

        const { data: insights, error: ragError } = await supabaseAdmin.rpc(
          "search_extraction_insights_v2",
          { query_embedding: queryEmbedding, match_limit: 8 }
        )
        if (ragError) console.error("RAG RPC error:", ragError.message)

        if (Array.isArray(insights) && insights.length) {
          const short = insights
            .map((i: any, idx: number) =>
              [
                `#${idx + 1} [${[i.primary_tag, i.secondary_tag, i.tertiary_tag].filter(Boolean).join(" / ")}]`,
                `Problem: ${i.problem_statement ?? ""}`,
                i.solution_given ? `Solution: ${i.solution_given}` : "",
                i.financial_impact ? `Impact: ${i.financial_impact}` : "",
                i.power_quote ? `Quote: ${i.power_quote}` : ""
              ]
                .filter(Boolean)
                .join("\n")
            )
            .join("\n\n")

          crucibleInlineInsights =
            "Use the following Crucible insights if relevant. Prefer precise, operational recommendations. If you use them, keep them concise and concrete.\n\n" +
            short +
            "\n"
        }
      } catch (e) {
        console.error("Crucible RAG pipeline failed:", e)
      }
    }

    // 3) Single system message that always includes the inline insights
    const systemMessage = {
      role: "system",
      content: `${crucibleInlineInsights}You are a specialized AI coach for the residential home services industry, based on 20 years of industry expertise and the Crucible Audit framework.

RESPONSE STRATEGY - TRIANGULATE FAST:
- If the question is vague: Ask 1-2 sharp clarifying questions MAX, then give your best answer
- If the question is clear: Answer directly with actionable insight with thorough context
- Do not data dump multiple paragraphs on every single answer - make sure you understand what the ask or the solution is
- Refrain from ask more than 2 clarifying questions before diving into an answer

TONE & STYLE:
- Direct and no-nonsense - like the best operators and consultants
- Cut through to the root cause
- Attack money left on the table
- Focus on throughput through dependent events and statistical fluctuations

RESPONSE LENGTH:
- Ensure responses throroughly answer the question or challenge posed and follow up with a question to clarify and offer suggestions.
- Be concise but substantive - do not assume answers - ask for clarification
- If explaining something complex, break it into digestible chunks with line breaks

EXAMPLES:

Vague question: "How do I increase revenue?"
Response: "Revenue is a result. What's the constraint - your call booking rate, average ticket, conversion rate, or capacity? Or are you dealing with seasonal fluctuations that need smoothing?"

Clear question: "Explain how call booking rate affects revenue"
Response: "Call booking rate is the percentage of inbound calls that convert to booked jobs. If you're getting 100 calls/day and booking 60%, that's 60 jobs. Increase that to 70% and you've added 10 jobs/day without spending a dime on marketing. Most companies leave 15-30% on the table here due to poor call handling, no urgency, or weak process."`
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
      errorMessage = "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage = "OpenAI API Key is incorrect. Please fix it in your profile settings."
    }

    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
