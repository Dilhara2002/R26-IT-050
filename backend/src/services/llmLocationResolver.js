const ollama = require("ollama").default;

const getLocationCandidates = async (location) => {
  try {
    const cleanLocation = String(location || "").trim();

    if (!cleanLocation) {
      return [];
    }

    const prompt = `
You are a Sri Lankan location correction assistant.

The user entered a possibly misspelled Sri Lankan place name.

Input:
${cleanLocation}

Return ONLY valid JSON in exactly this structure:

{
  "candidates": [
    "Most likely location",
    "Second possible location",
    "Third possible location"
  ]
}

Rules:
- Return only Sri Lankan place names.
- The first candidate must be the most likely intended place.
- Prefer common cities/towns when spelling similarity is strong.
- Do not invent places.
- Do not explain.
- Do not use markdown.
- Return at most 5 candidates.
`;

    const response = await ollama.chat({
      model: "llama3.1:8b",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      format: "json",
    });

    const rawContent = response?.message?.content;

    if (!rawContent) {
      return [];
    }

    const parsed = JSON.parse(rawContent);

    if (!Array.isArray(parsed.candidates)) {
      return [];
    }

    const candidates = parsed.candidates
      .map((candidate) => String(candidate || "").trim())
      .filter(Boolean)
      .filter(
        (candidate, index, array) =>
          array.findIndex(
            (item) =>
              item.toLowerCase() === candidate.toLowerCase()
          ) === index
      )
      .slice(0, 5);

    console.log(
      `AI candidates for "${cleanLocation}":`,
      candidates
    );

    return candidates;
  } catch (error) {
    console.log(
      "LLM Location Resolver Error:",
      error.message
    );

    return [];
  }
};

module.exports = {
  getLocationCandidates,
};