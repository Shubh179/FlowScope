const neo4j = require('neo4j-driver');

let driver = null;
let isConnected = false;

async function initDriver() {
  const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
  const user = process.env.NEO4J_USER || 'neo4j';
  const password = process.env.NEO4J_PASSWORD || 'password';

  try {
    // Optimized driver config for serverless/cloud environments
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionTimeout: 30000,
      logging: neo4j.logging.console('warn')
    });
    
    const serverInfo = await driver.getServerInfo();
    console.log(`  ✓ Neo4j connected: ${serverInfo.address}`);
    isConnected = true;
    return true;
  } catch (err) {
    console.log(`  ✗ Neo4j unavailable — using CSV fallback mode`);
    console.log(`    (${err.message})`);
    isConnected = false;
    return false;
  }
}

function getDriver() {
  return driver;
}

function getIsConnected() {
  return isConnected;
}

async function closeDriver() {
  if (driver) {
    await driver.close();
  }
}

module.exports = { initDriver, getDriver, getIsConnected, closeDriver };
