import app from '../../backend/src/app.js';
import { driver } from '../../backend/src/config/neo4j.js';
import graphManager from '../../backend/src/ai-engine/knowledge-graph/graphManager.js';
console.error=()=>{};
const timer=setTimeout(()=>{console.log(JSON.stringify({status:'timeout'}));process.exit(2)},60000);
const server=app.listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
try {
 const exact=await graphManager.getRouteRisks('A1 Colombo-Kandy Segment 34');
 console.log(JSON.stringify({check:'active_service_exact_match',matchType:exact.matchType,count:exact.riskCount,route:exact.routeCode}));
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/safety/recommend-route`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startLocation:'Kandy',endLocation:'Colombo',budget:25000,passengers:4,preferredCategory:'Sedan'}),signal:AbortSignal.timeout(50000)});
 const b=await response.json();
 const ids=(b.graphRAG?.matchedRisks||[]).map(r=>r.riskId);
 const session=driver.session({defaultAccessMode:'READ'});
 let verification;
 try {const q=await session.run('MATCH (r:Route {routeCode: $route})-[:HAS_RISK]->(h:DisasterRisk) WHERE h.riskId IN $ids RETURN count(DISTINCT h.riskId) AS matched',{route:b.graphRAG?.routeCode||'',ids});verification={database:q.summary.database.name,verifiedMatchedIds:q.records[0].get('matched').toNumber()};}finally{await session.close();}
 console.log(JSON.stringify({http:response.status,success:b.success,code:b.code,graph:{status:b.graphRAG?.status,matchType:b.graphRAG?.matchType,route:b.graphRAG?.routeCode,count:b.graphRAG?.riskCount,returnedRecords:ids.length,...verification},model:{name:b.riskPrediction?.modelName,risk:b.riskPrediction?.riskLevel,confidencePercent:b.riskPrediction?.confidencePercent,inputs:b.riskPrediction?.inputFeatures},vehicle:{status:b.vehicleIntegration?.status,name:b.bestVehicle?.vehicleName,estimatedPrice:b.bestVehicle?.estimatedHirePrice,pricingStatus:b.bestVehicle?.pricing?.status},route:{mode:b.routeResult?.selectedRouteMode,distanceKm:b.routeResult?.distanceKm,comparisonAvailable:b.routeResult?.comparisonAvailable,roadEvidence:b.routeResult?.roadEvidence,historicalGraphEvidence:b.routeResult?.historicalGraphEvidence},weatherStatus:b.analysis?.weatherStatus},null,2));
} catch(e){console.log(JSON.stringify({error:e.name,code:e.code}));}
finally{server.closeAllConnections();server.close();await driver.close();clearTimeout(timer);}
