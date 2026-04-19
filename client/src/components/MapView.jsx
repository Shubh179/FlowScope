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

  // Relevant nodes are those with valid coordinates
  const relevantNodes = (nodes || []).filter(n => 
    n.coords && Array.isArray(n.coords) && n.coords.length === 2 &&
    !isNaN(n.coords[0]) && !isNaN(n.coords[1])
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

        {/* Trade Route Arcs (Polylines) with Flow Animation */}
        {validRoutes.map((route, i) => {
          const color = route.type === 'IMPORT' ? '#2563EB' : '#9333EA'; // Blue for direct, Purple for upstream
          
          return (
            <div key={`group-${i}`}>
              <Polyline 
                positions={[route.from, route.to]}
                pathOptions={{
                  color: color,
                  weight: 2.5,
                  opacity: 0.8,
                  dashArray: '10, 10',
                  lineJoin: 'round',
                  className: 'animate-flow'
                }}
              />
              {/* Permanent HSN Label on Path */}
              <Marker 
                position={[(route.from[0] + route.to[0])/2, (route.from[1] + route.to[1])/2]} 
                icon={L.divIcon({
                  className: 'hsn-label-on-path',
                  html: `<div style="background: ${color}; color: white; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); white-space: nowrap;">HS ${route.hsn}</div>`,
                  iconSize: [40, 14],
                  iconAnchor: [20, 7]
                })}
                interactive={false}
              />
              {/* Directional Arrow at Destination */}
              <Marker 
                position={route.to}
                icon={L.divIcon({
                  className: 'flow-arrow',
                  html: `<div style="color: ${color}; transform: rotate(${Math.atan2(route.to[0]-route.from[0], route.to[1]-route.from[1])}rad); font-size: 14px; font-weight: bold;">▶</div>`,
                  iconSize: [20, 20],
                  iconAnchor: [10, 10]
                })}
                interactive={false}
              />
            </div>
          );
        })}

        {/* Markers for Countries */}
        {relevantNodes.map((n, i) => (
          <Marker 
            key={`marker-${i}`}
            position={n.coords}
            icon={createMarkerIcon(n.tier === 0 ? '#2563EB' : '#475569')}
          >
            <Popup>
              <div className="p-2 min-w-[200px]">
                <div className="flex items-center gap-2 mb-2">
                   <div className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[9px] font-black uppercase">Tier {n.tier}</div>
                   <div className="text-[11px] font-black text-slate-800">{n.label}</div>
                </div>
                <div className="text-[10px] bg-slate-50 p-2 rounded border border-slate-100 text-slate-500 leading-relaxed italic">
                  "{n.description}"
                </div>
                <div className="text-[9px] text-slate-400 mt-2 uppercase font-bold tracking-widest text-right">{n.country}</div>
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
