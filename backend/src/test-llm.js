const {
  getLocationCandidates,
} = require("./services/llmLocationResolver");


const runTest = async () => {
  const candidates = await getLocationCandidates("puththalama");

  console.log("Location Candidates:", candidates);
};


runTest();
