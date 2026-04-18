const { getDriver, getIsConnected } = require('../config/neo4j');

class Neo4jService {
  /**
   * Search companies by name substring.
   */
  async searchCompanies(query) {
    if (!getIsConnected()) return null;
    const session = getDriver().session();
    try {
      const result = await session.run(
        `MATCH (c:Company)
         WHERE toLower(c.name) CONTAINS toLower($query)
         RETURN c.name AS name, c.country AS country
         ORDER BY c.name
         LIMIT 12`,
        { query }
      );
      return result.records.map((r) => ({
        name: r.get('name'),
        country: r.get('country'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get HSN codes associated with a company.
   */
  async getHSNCodes(companyName) {
    if (!getIsConnected()) return null;
    const session = getDriver().session();
    try {
      const result = await session.run(
        `MATCH (c:Company {name: $name})-[r:SUPPLIES_TO|:SUPPLIES_TO]-(other)
         RETURN DISTINCT r.hsn AS code, r.product AS description,
                count(r) AS count, sum(r.quantity) AS totalQuantity
         ORDER BY totalQuantity DESC`,
        { name: companyName }
      );
      const hsnList = result.records.map((r) => ({
        code: r.get('code'),
        description: r.get('description'),
        count: r.get('count').toNumber(),
        totalQuantity: r.get('totalQuantity').toNumber(),
      }));

      // Since we wiped the mock data edges in production seed, return default triggers
      // if no edges exist yet so the user can test the Gemini Traversal engine!
      if (hsnList.length === 0) {
        return [
          { code: '8708', description: 'Motor vehicle parts and accessories', count: 0, totalQuantity: 0 },
          { code: '8507', description: 'Electric accumulators (Batteries)', count: 0, totalQuantity: 0 },
          { code: '8542', description: 'Electronic integrated circuits', count: 0, totalQuantity: 0 },
          { code: '3004', description: 'Medicaments and Pharmaceuticals', count: 0, totalQuantity: 0 },
          { code: '7208', description: 'Flat-rolled products of iron/steel', count: 0, totalQuantity: 0 }
        ];
      }

      return hsnList;
    } finally {
      await session.close();
    }
  }

  /**
   * Traverse the supply chain graph from a company, optionally filtered by HSN.
   */
  async traverseGraph(companyName, hsnCode, maxDepth = 5) {
    if (!getIsConnected()) return null;
    const session = getDriver().session();
    try {
      let query;
      const params = { name: companyName, maxDepth: parseInt(maxDepth) };

      if (hsnCode && hsnCode !== 'all') {
        query = `
          MATCH path = (c:Company {name: $name})-[:SUPPLIES_TO*1..5]-(s)
          WHERE ALL(r IN relationships(path) WHERE r.hsn = $hsn)
          WITH path, nodes(path) AS ns, relationships(path) AS rs
          UNWIND ns AS n
          WITH COLLECT(DISTINCT n) AS allNodes, COLLECT(DISTINCT rs) AS allRels, path
          UNWIND allNodes AS node
          WITH COLLECT(DISTINCT {id: node.name, label: node.name, country: node.country, tradeVolume: node.totalVolume}) AS nodes,
               path
          UNWIND relationships(path) AS rel
          WITH nodes,
               COLLECT(DISTINCT {
                 source: startNode(rel).name,
                 target: endNode(rel).name,
                 hsn: rel.hsn,
                 quantity: rel.quantity,
                 product: rel.product,
                 date: rel.date
               }) AS edges
          RETURN nodes, edges`;
        params.hsn = hsnCode;
      } else {
        query = `
          MATCH path = (c:Company {name: $name})-[:SUPPLIES_TO*1..5]-(s)
          WITH path
          UNWIND nodes(path) AS node
          WITH COLLECT(DISTINCT {id: node.name, label: node.name, country: node.country, tradeVolume: node.totalVolume}) AS nodes,
               path
          UNWIND relationships(path) AS rel
          WITH nodes,
               COLLECT(DISTINCT {
                 source: startNode(rel).name,
                 target: endNode(rel).name,
                 hsn: rel.hsn,
                 quantity: rel.quantity,
                 product: rel.product,
                 date: rel.date
               }) AS edges
          RETURN nodes, edges`;
      }

      const result = await session.run(query, params);

      // Aggregate results from all paths
      const nodeMap = new Map();
      const edgeSet = new Map();

      for (const record of result.records) {
        const nodes = record.get('nodes');
        const edges = record.get('edges');

        for (const node of nodes) {
          if (!nodeMap.has(node.id)) {
            nodeMap.set(node.id, node);
          }
        }

        for (const edge of edges) {
          const key = `${edge.source}→${edge.target}→${edge.hsn}`;
          if (!edgeSet.has(key)) {
            edgeSet.set(key, edge);
          }
        }
      }

      const nodesArr = Array.from(nodeMap.values());
      const edgesArr = Array.from(edgeSet.values());

      // Build trade routes
      const routeMap = new Map();
      for (const e of edgesArr) {
        const sourceNode = nodeMap.get(e.source);
        const targetNode = nodeMap.get(e.target);
        if (sourceNode && targetNode && sourceNode.country !== targetNode.country) {
          const key = `${sourceNode.country}→${targetNode.country}`;
          if (!routeMap.has(key)) {
            routeMap.set(key, {
              from: sourceNode.country,
              to: targetNode.country,
              volume: 0,
              products: [],
            });
          }
          routeMap.get(key).volume += (typeof e.quantity === 'number' ? e.quantity : e.quantity?.toNumber?.() || 0);
        }
      }

      return {
        nodes: nodesArr,
        edges: edgesArr,
        tradeRoutes: Array.from(routeMap.values()),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get detailed information about a specific company.
   */
  async getCompanyDetails(companyName) {
    if (!getIsConnected()) return null;
    const session = getDriver().session();
    try {
      const result = await session.run(
        `MATCH (c:Company {name: $name})
         OPTIONAL MATCH (supplier)-[r1:SUPPLIES_TO]->(c)
         OPTIONAL MATCH (c)-[r2:SUPPLIES_TO]->(customer)
         RETURN c,
                COLLECT(DISTINCT {name: supplier.name, country: supplier.country}) AS suppliers,
                COLLECT(DISTINCT {name: customer.name, country: customer.country}) AS customers,
                sum(r1.quantity) AS importVolume,
                sum(r2.quantity) AS exportVolume`,
        { name: companyName }
      );

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const company = record.get('c').properties;

      return {
        name: company.name,
        country: company.country,
        totalImportVolume: record.get('importVolume')?.toNumber?.() || 0,
        totalExportVolume: record.get('exportVolume')?.toNumber?.() || 0,
        supplierCount: record.get('suppliers').filter((s) => s.name).length,
        customerCount: record.get('customers').filter((c) => c.name).length,
        suppliers: record.get('suppliers').filter((s) => s.name),
        customers: record.get('customers').filter((c) => c.name),
      };
    } finally {
      await session.close();
    }
  }
}

module.exports = new Neo4jService();
