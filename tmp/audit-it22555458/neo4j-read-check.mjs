import { driver } from '../../backend/src/config/neo4j.js';
const timer=setTimeout(()=>{console.log(JSON.stringify({result:'timeout',limitSeconds:25}));process.exit(2)},25000);
const session=driver.session({defaultAccessMode:'READ'});
try {
 const ping=await session.run('RETURN 1 AS ok');
 console.log(JSON.stringify({connectivity:'ok',database:ping.summary.database.name}));
 for (const [name,query] of [
 ['labels','MATCH (n) WHERE n:Road OR n:RoadSegment OR n:Route OR n:DisasterRisk RETURN labels(n) AS labels, count(*) AS count'],
 ['relationships','MATCH (r:Route)-[e]->(n) WHERE n:RoadSegment OR n:DisasterRisk RETURN type(e) AS relationship,labels(n) AS target,count(*) AS count'],
 ['supported_routes','MATCH (r:Route)-[:HAS_RISK]->(h:DisasterRisk) RETURN r.routeCode AS route,count(h) AS hazards ORDER BY hazards DESC LIMIT 8'],
 ['sample','MATCH (r:Route {routeCode: "A1"})-[:HAS_RISK]->(h:DisasterRisk) RETURN r.routeCode AS route,h.riskId AS id,h.routeName AS road,h.riskType AS type,h.severity AS severity,h.historicalOccurrenceCount AS occurrences LIMIT 2'],
 ['segments','MATCH (r:Route {routeCode: "A1"})-[:HAS_SEGMENT]->(s:RoadSegment)-[:HAS_HAZARD]->(h:DisasterRisk) RETURN s.segmentNumber AS segment,s.routeName AS road,count(h) AS hazards LIMIT 3'],
 ['road_keys','MATCH (r:Road) RETURN keys(r) AS propertyNames LIMIT 1']
 ]) {const result=await session.run(query); console.log(JSON.stringify({check:name,rows:result.records.map(r=>r.toObject())}));}
} catch(e) {console.log(JSON.stringify({connectivity:'failed',code:e.code,name:e.name,message:String(e.message).replace(/password[^\n]*/ig,'[redacted]').slice(0,400)}));}
finally{await session.close();await driver.close();clearTimeout(timer);}
