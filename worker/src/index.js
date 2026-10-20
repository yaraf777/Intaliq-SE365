const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const MAX_MESSAGES = 12;
const MAX_CHARS = 1000;

const SYSTEM_PROMPT = `You are Intaliq AI Coach, a friendly fitness assistant inside the Intaliq app.
Help users plan workouts, pace their goals, and pick training sessions.
Keep answers short (under 120 words), practical, and encouraging. Use plain text, no markdown tables.
If someone describes pain, injury, or a medical issue, suggest they consult a professional.`;

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim());
  const isAllowed = allowed.includes(origin) || /^https:\/\/intaliq-se-365[\w-]*\.vercel\.app$/.test(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function profileContext(profile = {}) {
  const parts = [];
  if (profile.name) parts.push(`Name: ${String(profile.name).slice(0, 60)}`);
  if (profile.fitnessLevel) parts.push(`Fitness level: ${String(profile.fitnessLevel).slice(0, 30)}`);
  if (Array.isArray(profile.goals) && profile.goals.length) {
    parts.push(`Current goals: ${profile.goals.slice(0, 5).map((goal) => String(goal).slice(0, 80)).join("; ")}`);
  }
  return parts.length ? `\nAbout this user:\n${parts.join("\n")}` : "";
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return json({ error: "Use POST" }, 405, headers);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400, headers);
    }

    const messages = (Array.isArray(body.messages) ? body.messages : [])
      .filter((message) => (message.role === "user" || message.role === "assistant") && typeof message.content === "string")
      .slice(-MAX_MESSAGES)
      .map((message) => ({ role: message.role, content: message.content.slice(0, MAX_CHARS) }));

    if (!messages.length || messages[messages.length - 1].role !== "user") {
      return json({ error: "Send at least one user message" }, 400, headers);
    }

    try {
      const result = await env.AI.run(MODEL, {
        messages: [{ role: "system", content: SYSTEM_PROMPT + profileContext(body.profile) }, ...messages],
        max_tokens: 400,
      });
      return json({ reply: (result.response || "").trim() }, 200, headers);
    } catch (error) {
      console.error("AI error", error);
      return json({ error: "The AI coach is unavailable right now" }, 502, headers);
    }
  },
};
