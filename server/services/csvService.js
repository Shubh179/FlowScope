const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class CSVGraphService {
  constructor() {
    this.companies = new Map();
    this.edges = [];
    this.loaded = false;
  }

  loadData() {
    return new Promise((resolve, reject) => {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'supply_chain_data.csv');
      const rows = [];

      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => {
          this._buildGraph(rows);
          this.loaded = true;
          console.log(`  ✓ CSV loaded: ${this.companies.size} companies, ${this.edges.length} trade links`);
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  _buildGraph(rows) {
    for (const row of rows) {
      const buyer = row.buyer_name?.trim();
      const supplier = row.supplier_name?.trim();
      const hsn = row.hsn_code?.trim();
      const product = row.product_description?.trim();
      const importCountry = row.import_country?.trim();
      const exportCountry = row.export_country?.trim();
      const date = row.trade_date?.trim();
      const quantity = parseInt(row.quantity) || 0;

      if (!buyer || !supplier) continue;

      // Register companies
      if (!this.companies.has(buyer)) {
        this.companies.set(buyer, {
          name: buyer,
          country: importCountry,
          totalVolume: 0,
        });
      }
      if (!this.companies.has(supplier)) {
        this.companies.set(supplier, {
          name: supplier,
          country: exportCountry,
          totalVolume: 0,
        });
      }

      this.companies.get(buyer).totalVolume += quantity;
      this.companies.get(supplier).totalVolume += quantity;

      // Register edge (supplier → buyer)
      this.edges.push({
        buyer,
        supplier,
        hsn,
        product,
        importCountry,
        exportCountry,
        date,
        quantity,
      });
    }
  }

  searchCompanies(query) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return Array.from(this.companies.values())
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact start match first
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.totalVolume - a.totalVolume;
      })
      .slice(0, 12)
      .map((c) => ({ name: c.name, country: c.country }));
  }

  getHSNCodes(companyName) {
    const companyEdges = this.edges.filter(
      (e) => e.buyer === companyName || e.supplier === companyName
    );

    const hsnMap = new Map();
    for (const edge of companyEdges) {
      if (!hsnMap.has(edge.hsn)) {
        hsnMap.set(edge.hsn, {
          code: edge.hsn,
          description: edge.product,
          count: 0,
          totalQuantity: 0,
        });
      }
      const entry = hsnMap.get(edge.hsn);
      entry.count++;
      entry.totalQuantity += edge.quantity;
    }

    return Array.from(hsnMap.values()).sort(
      (a, b) => b.totalQuantity - a.totalQuantity
    );
  }

  traverseGraph(companyName, hsnCode, maxDepth = 5) {
    const visitedNodes = new Map();
    const visitedEdges = [];
    const queue = [{ name: companyName, depth: 0 }];
    const visited = new Set([companyName]);

    while (queue.length > 0) {
      const { name, depth } = queue.shift();
      if (depth > maxDepth) continue;

      const company = this.companies.get(name);
      if (company) {
        visitedNodes.set(name, { ...company, depth });
      }

      // Find all edges involving this company
      const relatedEdges = this.edges.filter((e) => {
        const matches = e.buyer === name || e.supplier === name;
        if (hsnCode && hsnCode !== 'all') {
          return matches && e.hsn === hsnCode;
        }
        return matches;
      });

      for (const edge of relatedEdges) {
        const edgeKey = `${edge.supplier}→${edge.buyer}→${edge.hsn}`;
        if (!visitedEdges.find((ve) => `${ve.supplier}→${ve.buyer}→${ve.hsn}` === edgeKey)) {
          visitedEdges.push(edge);
        }

        const neighbor = edge.buyer === name ? edge.supplier : edge.buyer;
        if (!visited.has(neighbor) && depth + 1 <= maxDepth) {
          visited.add(neighbor);
          queue.push({ name: neighbor, depth: depth + 1 });
        }
      }
    }

    // Build nodes
    const nodes = Array.from(visitedNodes.values()).map((c) => ({
      id: c.name,
      label: c.name,
      country: c.country,
      tradeVolume: c.totalVolume,
      depth: c.depth,
    }));

    // Build unique edges
    const edges = visitedEdges
      .filter((e) => visitedNodes.has(e.supplier) && visitedNodes.has(e.buyer))
      .map((e) => ({
        source: e.supplier,
        target: e.buyer,
        hsn: e.hsn,
        quantity: e.quantity,
        product: e.product,
        date: e.date,
      }));

    // Build trade routes for map
    const routeMap = new Map();
    for (const e of edges) {
      const sourceCompany = this.companies.get(e.source);
      const targetCompany = this.companies.get(e.target);
      if (sourceCompany && targetCompany && sourceCompany.country !== targetCompany.country) {
        const key = `${sourceCompany.country}→${targetCompany.country}`;
        if (!routeMap.has(key)) {
          routeMap.set(key, {
            from: sourceCompany.country,
            to: targetCompany.country,
            volume: 0,
            products: [],
          });
        }
        const route = routeMap.get(key);
        route.volume += e.quantity;
        if (!route.products.includes(e.product)) {
          route.products.push(e.product);
        }
      }
    }

    return {
      nodes,
      edges,
      tradeRoutes: Array.from(routeMap.values()),
    };
  }

  getCompanyDetails(companyName) {
    const company = this.companies.get(companyName);
    if (!company) return null;

    const asCustomer = this.edges.filter((e) => e.buyer === companyName);
    const asSupplier = this.edges.filter((e) => e.supplier === companyName);

    return {
      name: company.name,
      country: company.country,
      totalImportVolume: asCustomer.reduce((sum, e) => sum + e.quantity, 0),
      totalExportVolume: asSupplier.reduce((sum, e) => sum + e.quantity, 0),
      totalTradeVolume: company.totalVolume,
      supplierCount: new Set(asCustomer.map((e) => e.supplier)).size,
      customerCount: new Set(asSupplier.map((e) => e.buyer)).size,
      suppliers: [...new Set(asCustomer.map((e) => e.supplier))].map((s) => ({
        name: s,
        country: this.companies.get(s)?.country || 'Unknown',
      })),
      customers: [...new Set(asSupplier.map((e) => e.buyer))].map((b) => ({
        name: b,
        country: this.companies.get(b)?.country || 'Unknown',
      })),
      hsnCodes: this.getHSNCodes(companyName),
    };
  }

  getStats() {
    const countries = new Set();
    for (const c of this.companies.values()) {
      countries.add(c.country);
    }
    return {
      totalCompanies: this.companies.size,
      totalTradeLinks: this.edges.length,
      totalCountries: countries.size,
      totalHSNCodes: new Set(this.edges.map((e) => e.hsn)).size,
    };
  }
}

module.exports = new CSVGraphService();
