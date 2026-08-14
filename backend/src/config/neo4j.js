import neo4j from "neo4j-driver";
import dotenv from "dotenv";


dotenv.config();



const NEO4J_URI =
  process.env.NEO4J_URI ||
  "bolt://localhost:7687";


const NEO4J_USERNAME =
  process.env.NEO4J_USERNAME ||
  "neo4j";


const NEO4J_PASSWORD =
  process.env.NEO4J_PASSWORD;



if (!NEO4J_PASSWORD) {

  console.warn(
    "⚠️ NEO4J_PASSWORD is missing in .env"
  );

}



export const driver = neo4j.driver(

  NEO4J_URI,

  neo4j.auth.basic(
    NEO4J_USERNAME,
    NEO4J_PASSWORD
  )

);



export const verifyNeo4jConnection = async () => {

  const session =
    driver.session();


  try {

    await session.run(
      "RETURN 1 AS result"
    );


    console.log(
      "✅ Connected to Neo4j Knowledge Graph"
    );


  } catch(error) {


    console.error(
      "❌ Neo4j connection failed:",
      error.message
    );


  } finally {


    await session.close();


  }

};



export const closeNeo4jConnection = async () => {

  await driver.close();

};