require('dotenv').config();
const neo4j = require('neo4j-driver');

const newCompanies = [
  { name: 'volkswagen', country: 'Germany', desc: 'German motor vehicle manufacturer' },
  { name: 'bmw', country: 'Germany', desc: 'German multinational manufacturer of performance luxury vehicles and motorcycles' },
  { name: 'honda', country: 'Japan', desc: 'Japanese public multinational conglomerate manufacturer of automobiles motorcycles and power equipment' },
  { name: 'mahindra & mahindra', country: 'India', desc: 'Indian multinational automotive manufacturing corporation' },
  { name: 'tata motors', country: 'India', desc: 'Indian multinational automotive manufacturing company' }
];

async function seedExtra() {
  console.log('\\n  ═══ Seeding Extra Companies ═══\\n');

  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  
  try {
    const session = driver.session();
    try {
      for (const c of newCompanies) {
        await session.run(
          `MERGE (n:Company {name: $name})
           SET n.country = $country,
               n.description = $desc`,
          { name: c.name, country: c.country, desc: c.desc }
        );
        console.log(`  ✓ Added: ${c.name} (${c.country})`);
      }
    } finally {
      await session.close();
    }
  } catch (error) {
    console.error('Seed error:', error.message);
  } finally {
    await driver.close();
    console.log('\\n  ✓ Seed complete.');
  }
}

seedExtra();
