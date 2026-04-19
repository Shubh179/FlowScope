require('dotenv').config();
const neo4j = require('neo4j-driver');

const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
const user = process.env.NEO4J_USER || 'neo4j';
const password = process.env.NEO4J_PASSWORD || 'password';

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

async function seedToyota() {
  try {
    const session = driver.session();
    try {
      await session.run(
        `MERGE (n:Company {name: 'toyota'})
         SET n.country = 'Japan',
             n.description = 'Japanese multinational automotive manufacturer'`
      );
      console.log('✓ Toyota added to Graph DB');
    } finally {
      await session.close();
    }
  } catch(e) {
    console.error(e);
  } finally {
    await driver.close();
  }
}
seedToyota();
