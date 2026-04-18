import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Light Professional Tiles
const TILE_LAYER = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const createMarkerIcon = (color) => L.divIcon({
  className: 'custom-map-marker',
  html: `<div style="background: ${color}; width: 10px; height: 10px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 5px rgba(0,0,0,0.1);"></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Component to handle map centering and animation
function MapController({ tradeRoutes }) {
  const map = useMap();
  useEffect(() => {
    if (tradeRoutes && tradeRoutes.length > 0) {
      // Safely extract coordinates
      const coords = tradeRoutes
        .flatMap(r => [r.from, r.to])
        .filter(c => Array.isArray(c) && c.length === 2 && !isNaN(c[0]) && !isNaN(c[1]));

      if (coords.length > 0) {
        try {
          const bounds = L.latLngBounds(coords);
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 6, animate: true, duration: 1.5 });
        } catch (e) {
          console.error("Map bounds error:", e);
        }
      }
    }
  }, [tradeRoutes, map]);
  return null;
}

export default function MapView({ tradeRoutes = [], nodes = [] }) {
  // Defensive check for tradeRoutes
  const validRoutes = (tradeRoutes || []).filter(r => 
    r && Array.isArray(r.from) && r.from.length === 2 && 
    Array.isArray(r.to) && r.to.length === 2
  );

  // Relevant nodes are those participating in valid routes
  const relevantNodes = (nodes || []).filter(n => 
    n.coords && Array.isArray(n.coords) && n.coords.length === 2 &&
    validRoutes.some(r => r.fromName === n.country || r.toName === n.country)
  );

  return (
    <div className="h-full w-full bg-[#E9EEF6] relative overflow-hidden" id="map-view-container">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={true}
        attributionControl={false}
      >
        <TileLayer url={TILE_LAYER} />
        
        <MapController tradeRoutes={validRoutes} />

        {/* Trade Route Arcs (Polylines) */}
        {validRoutes.map((route, i) => (
          <Polyline 
            key={`route-${i}`}
            positions={[route.from, route.to]}
            pathOptions={{
              color: '#3B82F6',
              weight: 1.5,
              opacity: 0.6,
              dashArray: '5, 8',
              lineJoin: 'round'
            }}
          />
        ))}

        {/* Markers for Countries */}
        {relevantNodes.map((n, i) => (
          <Marker 
            key={`marker-${i}`}
            position={n.coords}
            icon={createMarkerIcon('#3B82F6')}
          >
            <Popup>
              <div className="p-1">
                <div className="text-[11px] font-bold text-slate-800">{n.country}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Logistics Hub</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Empty State Overlay */}
      {(!tradeRoutes || tradeRoutes.length === 0) && (
        <div className="absolute inset-0 z-[1000] flex items-center justify-center bg-white/20 backdrop-blur-[1px] pointer-events-none">
          <div className="bg-white/90 px-5 py-2.5 rounded-full border border-slate-200 shadow-xl flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse"/>
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">
              Ready for Network Data
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
