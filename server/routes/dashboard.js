const express = require('express');
const router = express.Router();
const csvService = require('../services/csvService');

/**
 * GET /api/dashboard
 * Returns aggregated dashboard data from loaded CSV supply chain data.
 */
router.get('/', (req, res) => {
  try {
    const companies = csvService.companies;
    const edges = csvService.edges;

    // ─── Top-level stats ───
    const countries = new Set();
    let totalImportVol = 0;
    let totalExportVol = 0;
    for (const c of companies.values()) {
      countries.add(c.country);
    }
    for (const e of edges) {
      totalImportVol += e.quantity;
    }
    totalExportVol = totalImportVol; // each edge is both an import and export

    const totalTradeBalance = totalExportVol - totalImportVol;

    // ─── Top Companies by Trade Volume ───
    const companyArr = Array.from(companies.values())
      .sort((a, b) => b.totalVolume - a.totalVolume)
      .slice(0, 8);

    const maxVol = companyArr[0]?.totalVolume || 1;
    const topCompanies = companyArr.map((c) => {
      const asCustomer = edges.filter(e => e.buyer === c.name);
      const asSupplier = edges.filter(e => e.supplier === c.name);
      const importVol = asCustomer.reduce((s, e) => s + e.quantity, 0);
      const exportVol = asSupplier.reduce((s, e) => s + e.quantity, 0);
      return {
        name: c.name,
        country: c.country,
        totalVolume: c.totalVolume,
        importVolume: importVol,
        exportVolume: exportVol,
        percentOfMax: ((c.totalVolume / maxVol) * 100).toFixed(1),
      };
    });

    // ─── Top Countries by Trade Volume ───
    const countryVol = {};
    for (const e of edges) {
      countryVol[e.importCountry] = (countryVol[e.importCountry] || 0) + e.quantity;
      countryVol[e.exportCountry] = (countryVol[e.exportCountry] || 0) + e.quantity;
    }
    const topCountries = Object.entries(countryVol)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([country, volume]) => ({ country, volume }));

    // ─── Top Sectors (HSN-based) ───
    const hsnVol = {};
    for (const e of edges) {
      const key = e.product || e.hsn;
      if (!hsnVol[key]) {
        hsnVol[key] = { hsn: e.hsn, product: e.product, volume: 0, count: 0 };
      }
      hsnVol[key].volume += e.quantity;
      hsnVol[key].count++;
    }
    const topSectors = Object.values(hsnVol)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 6);

    // ─── Monthly Trade Trend ───
    const monthly = {};
    for (const e of edges) {
      if (e.date) {
        const month = e.date.substring(0, 7); // YYYY-MM
        if (!monthly[month]) {
          monthly[month] = { month, imports: 0, exports: 0, total: 0 };
        }
        monthly[month].imports += e.quantity;
        monthly[month].exports += e.quantity;
        monthly[month].total += e.quantity;
      }
    }
    const monthlyTrend = Object.values(monthly).sort((a, b) => a.month.localeCompare(b.month));

    // ─── User Acquisition / Trade Distribution by Country ───
    const tradeByCountry = {};
    for (const e of edges) {
      tradeByCountry[e.exportCountry] = (tradeByCountry[e.exportCountry] || 0) + e.quantity;
    }
    const tradeDistribution = Object.entries(tradeByCountry)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([country, volume]) => ({ country, volume }));

    // ─── Recent Trades (latest by date) ───
    const sortedEdges = [...edges]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 8);

    const recentActivity = sortedEdges.map((e) => ({
      buyer: e.buyer,
      supplier: e.supplier,
      product: e.product,
      hsn: e.hsn,
      quantity: e.quantity,
      date: e.date,
      importCountry: e.importCountry,
      exportCountry: e.exportCountry,
    }));

    res.json({
      summary: {
        totalCompanies: companies.size,
        totalTradeLinks: edges.length,
        totalCountries: countries.size,
        totalHSNCodes: new Set(edges.map(e => e.hsn)).size,
        totalImportVolume: totalImportVol,
      },
      topCompanies,
      topCountries,
      topSectors,
      monthlyTrend,
      tradeDistribution,
      recentActivity,
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Dashboard data failed' });
  }
});

module.exports = router;
