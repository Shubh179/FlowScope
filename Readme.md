# 🌐 FlowScope: Supply Chain Graph Intelligence

> **Visualizing the complexity of global trade through AI-driven graph intelligence.**

FlowScope is a high-performance supply chain intelligence platform designed to map, trace, and analyze global trade networks. By merging real-time trade data with AI-powered Bill of Materials (BOM) inference, FlowScope reveals deep-tier dependencies and identifies risks across multi-country logistics networks.

---

## ✨ Key Features

- **🛡️ Intelligent BOM Inference:** Automatically predicts and verifies product sub-components (e.g., Bauxite → Alumina → Aluminum).
- **🕸️ Dynamic Graph Engine:** Interactive multi-tier graph visualization powered by **Cytoscape.js**, featuring hardware-accelerated nodes and real-time path discovery.
- **🗺️ Global Map Intelligence:** Real-time trade route mapping using **Leaflet**, visualizing the physical flow of goods across continents with precise coordinates powered by the **OpenCage Geocoding API**.
- **📊 Intelligence Dossiers:** Instant access to verified company profiles, enriched dynamically with live data from **Wikipedia**.
- **🔍 Advanced Algorithms:** 
  - **Breadth-First Search (BFS):** Categorizes supply chain depth (Tier 1-4) automatically to discover direct and indirect dependencies.
  - **A* (A-Star) Pathfinding:** Optimizes logistics routes and distance tracking between suppliers and buyers across the globe.
- **📈 Global Trade Flow Data:** Integrates with the **UN Comtrade API** to fetch accurate trade volume metrics and cross-border shipment data.

---

## 🛠️ Technology Stack & Data Sources

| Layer | Technologies / Sources |
| :--- | :--- |
| **Frontend** | React, Vite, TailwindCSS, Framer Motion, Lucide Icons |
| **Backend** | Node.js, Express, Axios |
| **Database** | Neo4j (GraphDB), CSV Fast-Streaming |
| **Visualization** | Leaflet.js (Map), Cytoscape.js (Graph) |
| **Algorithms** | BFS, A* Search |
| **External APIs** | **UN Comtrade** (Trade Data), **Wikipedia** (Company Bios), **OpenCage** (Geocoding) |

---

## 🏗️ Architecture Overview

The system operates on a **Discovery-Cache** model:
1.  **Static Database:** Core company data and HSN taxonomies are stored in Neo4j and high-speed CSV caches.
2.  **Live Discovery:** When a node expansion is requested, the **Trace Engine** predicts dependencies, fetches volume metrics from the **UN Comtrade API**, and resolves company context via **Wikipedia**.
3.  **Geospatial Resolution:** Company addresses are passed through **OpenCage** to get precise latitude/longitude for rendering on the Leaflet map.
4.  **Real-time Aggregation:** The frontend merges database state with live-discovered partners into a unified graph store, utilizing A* algorithms to compute logistical distances.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- Neo4j Instance (Local or AuraDB)
- API Key for OpenCage

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/syn3rgy2026/Vibe_Creators_Syn3rgy_RudraSanjaySheth.git
   cd Vibe_Creators_Syn3rgy_RudraSanjaySheth
   ```

2. **Setup Server:**
   ```bash
   cd server
   npm install
   # Create a .env file based on the environment section below
   npm run dev
   ```

3. **Setup Client:**
   ```bash
   cd ../client
   npm install
   npm run dev
   ```

---

## 🔑 Environment Variables

Create a `.env` file in the `server/` directory:

```env
PORT=3001
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
OPENCAGE_API_KEY=your_opencage_key
```

---

## 📐 Algorithmic Foundations

FlowScope leverages foundational graph algorithms to make sense of complex trade flows:

- **Breadth-First Search (BFS):** Traverses the supply chain network layer-by-layer to determine clear "Tiers":
  - **Tier 0:** Your search origin.
  - **Tier 1:** Direct strategic partners.
  - **Tier 2:** Secondary upstream suppliers.
  - **Tier 3+:** Raw material foundations (Ores, Minerals, Fuels).
- **A* (A-Star) Search Algorithm:** Computes the most efficient logistical paths and shortest transit distances between international trade nodes, accounting for geographical heuristics.

---

## 🤝 Contributors

**Vibe Creators - Syn3rgy**
- *Rudra Sanjay Sheth*
- *Tanvi Kamath*
- *Vidhi Shah*
- *Shubh Shah*

---

*FlowScope is built for precision. Trace the invisible, secure the future.*
