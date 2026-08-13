const ollama = require("ollama").default;


const getLocationCandidates = async (location) => {

  try {

    const prompt = `
You are a Sri Lankan location correction assistant.

The user entered a possibly misspelled location name.

Input:
${location}

Return ONLY valid JSON.

Format:

{
  "candidates": [
    "Location 1",
    "Location 2",
    "Location 3"
  ]
}

Rules:
- Only Sri Lankan places
- Include the most likely intended place first
- Do not explain
- Do not add markdown
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



    const data =
      JSON.parse(
        response.message.content
      );



    if (
      !data.candidates ||
      !Array.isArray(data.candidates)
    ) {

      return [location];

    }



    return data.candidates;



  } catch(error) {


    console.log(
      "LLM Location Resolver Error:",
      error.message
    );


    return [location];

  }

};



module.exports = {
  getLocationCandidates,
};