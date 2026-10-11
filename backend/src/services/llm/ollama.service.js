export const askOllama = async (prompt) => {
  const baseUrl = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const timeoutMs = Number(process.env.OLLAMA_TIMEOUT_MS || 30_000);
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || "llama3",
      prompt,
      format: "json",
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama request failed with status ${response.status}.`);
  }

  const data = await response.json();
  return data.response;
};
