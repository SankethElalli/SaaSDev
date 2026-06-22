import { useGetMapPins } from "@workspace/api-client-react";
import { useEffect, useRef } from "react";

export default function MapPage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const { data: pinsData, isLoading } = useGetMapPins({ query: { staleTime: 60_000, gcTime: 5 * 60_000 } });
  
  useEffect(() => {
    if (!import.meta.env.VITE_MAPPLS_KEY) return;
    
    // Basic initialization for Mappls (mock/simplified since we don't have a real key or fully injected script)
    // Normally we'd dynamically load the script and init window.mappls
    
    // As a fallback for no key, we just display a placeholder
  }, [pinsData]);

  if (!import.meta.env.VITE_MAPPLS_KEY) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        <div className="glass-card p-8 rounded-3xl max-w-md w-full">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2">Map Unavailable</h2>
          <p className="text-muted-foreground">The mapping service is not configured (missing VITE_MAPPLS_KEY). Please configure it to explore the local scene interactively.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 relative">
      <div ref={mapContainer} className="absolute inset-0 bg-muted/20" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-sm z-10">
          Loading map data...
        </div>
      )}
    </div>
  );
}
