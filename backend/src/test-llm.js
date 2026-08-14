import {
  getLocationCandidates,
} from "./services/llmLocationResolver.js";


const runTest = async () => {
  const candidates = await getLocationCandidates("puththalama");

  console.log("Location Candidates:", candidates);
};


runTest();
