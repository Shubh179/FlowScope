const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

class CSVGraphService {
  constructor() {
    this.companies = new Map();
    this.descriptions = new Map(); // New map for wikidata descriptions
    this.edges = [];
    this.loaded = false;
  }

  loadData() {
    return Promise.all([
      this._loadTradeData(),
      this._loadDescriptions()
    ]).then(() => {
      this.loaded = true;
      console.log(`  ✓ CSV loaded: ${this.companies.size} companies, ${this.edges.length} trade links, ${this.descriptions.size} dossiers`);
    });
  }

  _loadTradeData() {
    return new Promise((resolve, reject) => {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'supply_chain_data.csv');
      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          const buyer = row.buyer_name?.trim();
          const supplier = row.supplier_name?.trim();
          const hsn = row.hsn_code?.trim();
          const product = row.product_description?.trim();
          const importCountry = row.import_country?.trim();
          const exportCountry = row.export_country?.trim();
          const quantity = parseInt(row.quantity) || 0;

          if (buyer && supplier) {
            if (!this.companies.has(buyer)) this.companies.set(buyer, { name: buyer, country: importCountry, totalVolume: 0 });
            if (!this.companies.has(supplier)) this.companies.set(supplier, { name: supplier, country: exportCountry, totalVolume: 0 });
            
            this.companies.get(buyer).totalVolume += quantity;
            this.companies.get(supplier).totalVolume += quantity;

            this.edges.push({ buyer, supplier, hsn, product, importCountry, exportCountry, quantity });
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
  }

  _loadDescriptions() {
    return new Promise((resolve, reject) => {
      const csvPath = path.join(__dirname, '..', '..', 'data', 'df_cleaned_data (1).csv');
      if (!fs.existsSync(csvPath)) return resolve();

      fs.createReadStream(csvPath)
        .pipe(csv())
        .on('data', (row) => {
          const name = row.company_name?.trim();
          const desc = row.wikidata_description?.trim();
          if (name && desc) {
            this.descriptions.set(name.toLowerCase(), desc);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });
  }

  getCompanyDescription(name) {
    if (!name) return null;
    return this.descriptions.get(name.toLowerCase()) || null;
  }

  searchCompanies(query) {
    if (!query || query.length < 1) return [];
    const q = query.toLowerCase();
    return Array.from(this.companies.values())
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 12)
      .map((c) => ({ 
        name: c.name, 
        country: c.country,
        description: this.getCompanyDescription(c.name)
      }));
  }

  getHSNCodes(companyName) {
    const companyEdges = this.edges.filter(e => e.buyer === companyName || e.supplier === companyName);
    const hsnMap = new Map();
    for (const edge of companyEdges) {
      if (!hsnMap.has(edge.hsn)) hsnMap.set(edge.hsn, { code: edge.hsn, description: edge.product, count: 0, totalQuantity: 0 });
      const entry = hsnMap.get(edge.hsn);
      entry.count++;
      entry.totalQuantity += edge.quantity;
    }
    return Array.from(hsnMap.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }

  getCompanyDetails(companyName) {
    const company = this.companies.get(companyName);
    if (!company) return null;
    const asCustomer = this.edges.filter(e => e.buyer === companyName);
    const asSupplier = this.edges.filter(e => e.supplier === companyName);
    return {
      name: company.name,
      country: company.country,
      description: this.getCompanyDescription(companyName),
      totalTradeVolume: company.totalVolume,
      supplierCount: new Set(asCustomer.map(e => e.supplier)).size,
      customerCount: new Set(asSupplier.map(e => e.buyer)).size,
      hsnCodes: this.getHSNCodes(companyName),
    };
  }
}

module.exports = new CSVGraphService();
