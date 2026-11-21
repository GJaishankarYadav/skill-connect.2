import { useEffect, useMemo, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useMap
} from '@vis.gl/react-google-maps';
import { ExternalLink, MapPin, Navigation } from 'lucide-react';
import type { TrainingInstitution } from '../types';

export function buildViewOnMapsUrl(inst: TrainingInstitution): string {
  const loc = inst.locations[0];
  if (loc?.googleMapsUrl) return loc.googleMapsUrl;

  const queryParts = [inst.name, loc?.address, loc?.city].filter(Boolean);
  const query =
    queryParts.length > 0
      ? queryParts.join(', ')
      : loc?.latitude != null && loc?.longitude != null
        ? `${loc.latitude},${loc.longitude}`
        : inst.name;

  const params = new URLSearchParams({
    api: '1',
    query:
      loc?.latitude != null && loc?.longitude != null && !queryParts.length
        ? `${loc.latitude},${loc.longitude}`
        : query
  });
  if (inst.placeId) {
    params.set('query_place_id', inst.placeId);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function buildDirectionsUrl(
  inst: TrainingInstitution,
  userLocation?: { lat: number; lng: number } | null
): string {
  const loc = inst.locations[0];
  const destination =
    loc?.latitude != null && loc?.longitude != null
      ? `${loc.latitude},${loc.longitude}`
      : [inst.name, loc?.address, loc?.city].filter(Boolean).join(', ');

  const params = new URLSearchParams({
    api: '1',
    destination: destination || inst.name
  });
  if (inst.placeId) {
    params.set('destination_place_id', inst.placeId);
  }
  if (userLocation) {
    params.set('origin', `${userLocation.lat},${userLocation.lng}`);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

interface InstitutionWithCoords {
  institution: TrainingInstitution;
  lat: number;
  lng: number;
}

function MapBoundsController({
  markers,
  selectedId,
  userLocation
}: {
  markers: InstitutionWithCoords[];
  selectedId: number | null;
  userLocation?: { lat: number; lng: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    if (markers.length === 0 && !userLocation) return;

    if (selectedId !== null) {
      const selected = markers.find((m) => m.institution.id === selectedId);
      if (selected) {
        map.panTo({ lat: selected.lat, lng: selected.lng });
        const currentZoom = map.getZoom();
        if (!currentZoom || currentZoom < 13) {
          map.setZoom(14);
        }
        return;
      }
    }

    if (markers.length === 1 && !userLocation) {
      map.panTo({ lat: markers[0].lat, lng: markers[0].lng });
      map.setZoom(14);
      return;
    }

    const points: Array<{ lat: number; lng: number }> = markers.map((m) => ({
      lat: m.lat,
      lng: m.lng
    }));
    if (userLocation) {
      points.push(userLocation);
    }
    if (points.length > 0) {
      let south = points[0].lat;
      let north = points[0].lat;
      let west = points[0].lng;
      let east = points[0].lng;
      for (const p of points) {
        if (p.lat < south) south = p.lat;
        if (p.lat > north) north = p.lat;
        if (p.lng < west) west = p.lng;
        if (p.lng > east) east = p.lng;
      }
      map.fitBounds({ south, west, north, east }, 56);
    }
  }, [map, markers, selectedId, userLocation]);

  return null;
}

function InstitutionMarker({
  item,
  isSelected,
  userLocation,
  onSelect,
  onClose
}: {
  item: InstitutionWithCoords;
  isSelected: boolean;
  userLocation?: { lat: number; lng: number } | null;
  onSelect: (id: number) => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const { institution, lat, lng } = item;
  const primary = institution.locations[0];

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat, lng }}
        title={institution.name}
        zIndex={isSelected ? 1000 : 10}
        onClick={() => onSelect(institution.id)}
      >
        <Pin
          background={isSelected ? '#10b981' : '#0f382a'}
          borderColor={isSelected ? '#065f46' : '#064e3b'}
          glyphColor="#ffffff"
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow
          anchor={marker}
          maxWidth={290}
          onCloseClick={onClose}
        >
          <div className="map-infowindow">
            <div className="map-infowindow-badge">{institution.trainingMode}</div>
            <h3>{institution.name}</h3>
            {primary && (
              <p className="map-infowindow-address">
                {primary.address}
                {primary.area ? `, ${primary.area}` : ''}
                {primary.city ? `, ${primary.city}` : ''}
              </p>
            )}
            {institution.courses.length > 0 && (
              <p className="map-infowindow-courses">
                Courses: {institution.courses.map((c) => c.courseName).join(', ')}
              </p>
            )}
            <div className="map-infowindow-actions">
              <a
                href={buildViewOnMapsUrl(institution)}
                target="_blank"
                rel="noopener noreferrer"
                className="map-link-btn"
              >
                <ExternalLink size={13} />
                View on Google Maps
              </a>
              <a
                href={buildDirectionsUrl(institution, userLocation)}
                target="_blank"
                rel="noopener noreferrer"
                className="map-link-btn primary"
              >
                <Navigation size={13} />
                Get Directions
              </a>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function InstitutionMap({
  apiKey,
  institutions,
  selectedId,
  onSelectInstitution,
  userLocation
}: {
  apiKey: string;
  institutions: TrainingInstitution[];
  selectedId: number | null;
  onSelectInstitution: (id: number | null) => void;
  userLocation?: { lat: number; lng: number } | null;
}) {
  const [mapLoadError, setMapLoadError] = useState(false);

  const mappable = useMemo<InstitutionWithCoords[]>(() => {
    const rows: InstitutionWithCoords[] = [];
    for (const inst of institutions) {
      const primary = inst.locations[0];
      if (
        primary &&
        typeof primary.latitude === 'number' &&
        Number.isFinite(primary.latitude) &&
        typeof primary.longitude === 'number' &&
        Number.isFinite(primary.longitude)
      ) {
        rows.push({
          institution: inst,
          lat: primary.latitude,
          lng: primary.longitude
        });
      }
    }
    return rows;
  }, [institutions]);

  const defaultCenter = useMemo(() => {
    if (mappable.length > 0) {
      return { lat: mappable[0].lat, lng: mappable[0].lng };
    }
    if (userLocation) {
      return userLocation;
    }
    return { lat: 20.5937, lng: 78.9629 };
  }, [mappable, userLocation]);

  if (!apiKey || mapLoadError) {
    return (
      <div className="map-fallback-card">
        <MapPin size={28} color="#0f382a" />
        <h3>Interactive Google Map</h3>
        <p className="muted">
          {!apiKey
            ? 'Configure GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY in your environment secrets to render the interactive map pins directly here.'
            : 'Unable to load the embedded Google Map right now.'}
        </p>
        <p className="muted" style={{ fontSize: 13 }}>
          You can still open any institution&apos;s verified location or turn-by-turn directions directly in Google Maps using the buttons on each institution card.
        </p>
      </div>
    );
  }

  return (
    <div className="map-canvas-shell">
      <APIProvider
        apiKey={apiKey}
        libraries={['marker']}
        language="en"
        onError={() => setMapLoadError(true)}
      >
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={defaultCenter}
          defaultZoom={mappable.length > 0 ? 11 : 5}
          gestureHandling="greedy"
          streetViewControl={false}
          mapTypeControl={false}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <MapBoundsController
            markers={mappable}
            selectedId={selectedId}
            userLocation={userLocation}
          />

          {userLocation && (
            <AdvancedMarker
              position={userLocation}
              title="Your current location"
              zIndex={5}
            >
              <Pin
                background="#0284c7"
                borderColor="#0369a1"
                glyphColor="#ffffff"
                scale={0.9}
              />
            </AdvancedMarker>
          )}

          {mappable.map((item) => (
            <InstitutionMarker
              key={item.institution.id}
              item={item}
              isSelected={selectedId === item.institution.id}
              userLocation={userLocation}
              onSelect={(id) => onSelectInstitution(id)}
              onClose={() => onSelectInstitution(null)}
            />
          ))}
        </GoogleMap>
      </APIProvider>
      <div className="map-footer-bar">
        <span className="tabular-nums">
          {mappable.length} {mappable.length === 1 ? 'location' : 'locations'} pinned on Google Maps
        </span>
        {institutions.length > mappable.length && (
          <span className="muted">
            {institutions.length - mappable.length} online/unpinned
          </span>
        )}
      </div>
    </div>
  );
}
