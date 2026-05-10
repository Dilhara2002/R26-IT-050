const {
  correctLocationName,
} = require("./services/llmLocationResolver");

const runTest = async () => {
  const result = await correctLocationName("puththalama");

  console.log("Corrected Location:", result);
};

runTest();