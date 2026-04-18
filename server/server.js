require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDriver } = require('./config/neo4j');
const csvService = require('./services/csvService');
const companiesRouter = require('./routes/companies');
const graphRouter = require('./routes/graph');
const traceRouter = require('./routes/trace');
const dashboardRouter = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───
app.use(cors());
app.use(express.json());

// ─── API Routes ───
app.use('/api/companies', companiesRouter);
app.use('/api/graph', graphRouter);
app.use('/api/trace', traceRouter);
app.use('/api/dashboard', dashboardRouter);

app.get('/api/news', async (req, res) => {
  try {
    const userQuery = req.query.q || 'supply chain';
    // Ensure "trade" is part of the query to only show trade news
    const finalQuery = userQuery.toLowerCase().includes('trade') ? userQuery : `${userQuery} AND trade`;
    
    // Using fetch API
    const response = await fetch(`https://newsdata.io/api/1/news?apikey=${process.env.NEWS_API_KEY}&q=${encodeURIComponent(finalQuery)}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('News fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// ─── Health Check ───
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mode: require('./config/neo4j').getIsConnected() ? 'neo4j' : 'csv-fallback',
  });
});

// ─── Start Server ───
async function start() {
  console.log('\n  ╔═══════════════════════════════════════╗');
  console.log('  ║         F L O W S C O P E             ║');
  console.log('  ║    Supply Chain Intelligence API       ║');
  console.log('  ╚═══════════════════════════════════════╝\n');

  // Load CSV data (always — used as fallback and for stats)
  try {
    await csvService.loadData();
  } catch (err) {
    console.error('  ✗ Failed to load CSV data:', err.message);
    process.exit(1);
  }

  // Try Neo4j connection (optional)
  await initDriver();

  app.listen(PORT, () => {
    console.log(`\n  ✓ Server running on http://localhost:${PORT}`);
    console.log(`  ✓ API available at http://localhost:${PORT}/api\n`);
  });
}

start();
