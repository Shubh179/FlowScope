const { GoogleGenAI } = require('@google/genai');

class BomService {
  constructor() {
    this.ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
    // Cache BOM results to avoid duplicate Gemini calls
    this.cache = new Map();
    // Track if daily quota is exhausted — skip Gemini entirely
    this.quotaExhausted = false;
    this.quotaResetTime = 0;
  }

  /**
   * Given a target HS code and its description, returns an array of upstream 
   * HS chapters/headings (2 or 4 digit codes) required to manufacture it.
   * Includes caching, rate-limit detection, and static fallback.
   */
  async getUpstreamHsCodes(targetHsCode, targetDescription) {
    // Normalize to 2-digit chapter for caching (reduces unique calls)
    const cacheKey = String(targetHsCode).substring(0, 2);

    if (this.cache.has(cacheKey)) {
      console.log(`[BOM] Cache hit for HS ${cacheKey}`);
      return this.cache.get(cacheKey);
    }

    // If daily quota exhausted, go straight to fallback
    if (this.quotaExhausted && Date.now() < this.quotaResetTime) {
      console.log(`[BOM] Daily quota exhausted. Using fallback for HS ${cacheKey}`);
      return this._fallbackBom(cacheKey);
    }

    if (!process.env.GEMINI_API_KEY) {
       console.warn('[BOM] GEMINI_API_KEY not set. Using fallback.');
       return this._fallbackBom(cacheKey);
    }

    const prompt = `
    You are an expert in global trade, supply chains, and the Harmonized System (HS) code taxonomy.
    I am building a Bill of Materials (BOM) aware supply chain traversal graph.

    The target product being manufactured is:
    HS Code: ${targetHsCode}
    Description: ${targetDescription}

    Identify the key upstream raw materials and primary components required to manufacture this product.
    Provide your output ONLY as a JSON array of strings containing the 2-digit HS chapter codes for these inputs.
    Include only the most important 3-5 upstream categories.
    Do not include any other text, markdown, or explanation.
    
    Example response format:
    ["72", "85", "28", "39"]
    `;

    // Single attempt with quick fallback
    try {
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2
        }
      });

      const text = response.text;
      const codes = JSON.parse(text);
      const result = Array.isArray(codes) ? codes.map(c => String(c)) : [];

      // Reset quota flag on success
      this.quotaExhausted = false;

      this.cache.set(cacheKey, result);
      return result;

    } catch (error) {
      if (error.status === 429) {
        // Check if it's a DAILY quota (limit: 0) vs per-minute
        const isDaily = error.message && error.message.includes('limit: 0');
        if (isDaily) {
          console.warn(`[BOM] DAILY quota exhausted. Switching to fallback-only mode for 10 min.`);
          this.quotaExhausted = true;
          this.quotaResetTime = Date.now() + 10 * 60 * 1000; // 10 minutes
        } else {
          console.warn(`[BOM] Per-minute rate limit. Using fallback for HS ${cacheKey}.`);
        }
      } else {
        console.error(`[BOM] Gemini failed:`, error.message || error);
      }
    }

    // Use fallback
    return this._fallbackBom(cacheKey);
  }

  /**
   * Comprehensive static fallback BOM rules when Gemini is unavailable.
   * Covers all major HS chapters used in supply chain tracing.
   */
  _fallbackBom(hsChapter) {
    const fallback = {
      // ─── Finished Goods ───
      '87': ['72', '76', '39', '40', '85'],            // Vehicles → Steel, Aluminum, Plastics, Rubber, Electronics
      '88': ['72', '76', '85', '84'],                   // Aircraft → Steel, Aluminum, Electronics, Machinery
      '86': ['72', '85', '84'],                         // Rail → Steel, Electronics, Machinery
      '89': ['72', '76', '84'],                         // Ships → Steel, Aluminum, Machinery
      
      // ─── Electronics & Machinery ───
      '85': ['72', '74', '28', '39', '26'],             // Electrical → Steel, Copper, Chemicals, Plastics, Ores
      '84': ['72', '76', '74', '39', '85'],             // Machinery → Steel, Aluminum, Copper, Plastics, Electronics
      '90': ['70', '85', '39', '72'],                   // Instruments → Glass, Electronics, Plastics, Steel
      
      // ─── Pharmaceuticals & Chemicals ───
      '30': ['29', '28', '39', '70', '48'],             // Pharma → Organic chem, Inorganic, Plastics, Glass, Paper
      '29': ['27', '28', '25'],                         // Organic chemicals → Fuels, Inorganic, Minerals
      '28': ['25', '26'],                               // Inorganic chemicals → Minerals, Ores
      '38': ['29', '28', '27'],                         // Chemical products → Organic, Inorganic, Fuels
      
      // ─── Base Materials ───
      '72': ['26', '27', '25'],                         // Iron/Steel → Ores, Fuels, Minerals
      '73': ['72'],                                      // Steel articles → Steel
      '74': ['26', '27'],                               // Copper → Ores, Fuels
      '75': ['26', '27'],                               // Nickel → Ores, Fuels
      '76': ['26', '27'],                               // Aluminum → Ores, Fuels
      '78': ['26', '27'],                               // Lead → Ores, Fuels
      '79': ['26', '27'],                               // Zinc → Ores, Fuels
      '80': ['26', '27'],                               // Tin → Ores, Fuels
      
      // ─── Plastics & Rubber ───
      '39': ['27', '29', '28'],                         // Plastics → Fuels, Organic chem, Inorganic chem
      '40': ['27', '29'],                               // Rubber → Fuels, Organic chem
      
      // ─── Textiles ───
      '61': ['52', '54', '39'],                         // Clothing → Cotton, Synthetics, Plastics
      '62': ['52', '54', '39'],                         // Clothing → Cotton, Synthetics, Plastics
      '52': ['25'],                                      // Cotton → Minerals (terminal-ish)
      '54': ['29', '27'],                               // Man-made filaments → Organic chem, Fuels
      
      // ─── Raw Materials (TERMINAL — no upstream) ───
      '27': ['25'],                                      // Fuels → Minerals
      '26': [],                                          // Ores → Raw material
      '25': [],                                          // Minerals → Raw material
      '01': [],                                          // Animals
      '02': [],                                          // Meat
      '03': [],                                          // Fish
      '10': [],                                          // Cereals
    };
    const result = fallback[hsChapter] || ['72', '85', '28'];
    this.cache.set(hsChapter, result);
    console.log(`[BOM] Using fallback for HS ${hsChapter}: ${result.join(', ') || '(terminal)'}`);
    return result;
  }
}

module.exports = new BomService();
