import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Globe, Loader2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Professional Map Tile
const TILE_LAYER = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const createCustomIcon = (color = '#3B82F6') => L.divIcon({
  className: 'custom-marker',
  html: `<div style="background-color: ${color}; width: 14px; height: 14px; border: 3px solid white; border-radius: 50%; box-shadow: 0 4px 12px rgba(0,0,0,0.15);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function MapSync({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, 5, { duration: 1.5, easeLinearity: 0.25 });
    }
  }, [center, map]);
  return null;
}

export default function MapView({ locations, selectedLocation, onMarkerClick }) {
  return (
    <div className="h-full w-full relative bg-slate-100 overflow-hidden group">
      <MapContainer 
        center={[20, 0]} 
        zoom={2} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer url={TILE_LAYER} />
        <MapSync center={selectedLocation?.coords} />
        <ZoomControl position="bottomright" />

        {locations.map((loc, i) => (
          <Marker 
            key={i} 
            position={loc.coords} 
            icon={createCustomIcon(loc.color)}
            eventHandlers={{ click: () => onMarkerClick(loc) }}
          >
            <Popup className="premium-popup">
              <div className="flex items-center gap-3">
                <span className="text-lg">{loc.flag || '📍'}</span>
                <div className="min-w-0">
                  <div className="text-xs font-black text-slate-800 truncate leading-none mb-1">{loc.name}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{loc.country}</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Floating Map Legend/Status */}
      <div className="absolute top-4 right-4 z-[1000] pointer-events-none">
         <motion.div 
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           className="bg-white/90 backdrop-blur-md border border-slate-200 p-3 rounded-2xl shadow-premium flex items-center gap-3"
         >
            <Globe size={14} className="text-blue-500" />
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Global Logistics Overlay</span>
         </motion.div>
      </div>

      <AnimatePresence>
        {!locations.length && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[1001] bg-slate-50/10 backdrop-blur-[1px] pointer-events-none flex items-center justify-center"
          >
            <div className="bg-white/80 backdrop-blur-md px-6 py-3 rounded-full border border-slate-100 shadow-premium flex items-center gap-3">
               <Loader2 size={16} className="text-blue-500 animate-spin" />
               <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Calibrating Satellite Stream...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
