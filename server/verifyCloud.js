require('dotenv').config();
const neo4j = require('neo4j-driver');

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));

async function verify() {
  const session = driver.session();
  try {
    const res = await session.run('MATCH (n:Company) RETURN count(n) AS count');
    console.log(`\n✅ SUCCESS! Cloud Database is securely connected.`);
    console.log(`📊 Current Company Count in Cloud: ${res.records[0].get('count').low}\n`);
  } catch (error) {
    console.error(`\n❌ Failed to query database:`, error.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

verify();
