console.error = () => {};
const {default: app} = await import('../../backend/src/app.js');
const {driver} = await import('../../backend/src/config/neo4j.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(r=>server.once('listening',r));
const started=Date.now();
try {
 const response=await fetch(`http://127.0.0.1:${server.address().port}/api/safety/recommend-route`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({startLocation:'Kandy',endLocation:'Colombo',budget:25000,passengers:4,preferredCategory:'Sedan'}),signal:AbortSignal.timeout(55000)});
 const b=await response.json();
 console.log(JSON.stringify({http:response.status,elapsedSeconds:(Date.now()-started)/1000,success:b.success,code:b.code,route:b.routeResult,analysis:b.analysis,vehicle:b.bestVehicle?.vehicleName,vehicleStatus:b.vehicleIntegration?.status,graphStatus:b.graphRAG?.status},null,2));
} catch(e){console.log(JSON.stringify({error:e.name,elapsedSeconds:(Date.now()-started)/1000}));}
server.closeAllConnections();server.close();await driver.close();
process.exit(0);
