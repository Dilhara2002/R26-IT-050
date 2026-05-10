const ollama = require("ollama");

const correctLocationName = async (location) => {
  try {
    const prompt = `
You are a Sri Lankan location correction assistant.

Correct the following Sri Lankan place name spelling.

Input: ${location}

Rules:
- Return ONLY the corrected location name
- Do not explain
- Do not add extra text
`;

    const response = await ollama.chat({
      model: "llama3.1:8b",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    return response.message.content.trim();
  } catch (error) {
    console.log("LLM Location Resolver Error:", error.message);

    return location;
  }
};

module.exports = {
  correctLocationName,
};