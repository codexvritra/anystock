import type { StyleSpecification, ExpressionSpecification } from "maplibre-gl";

/**
 * "Street night": the city in dark greens with the arterials glowing neon, so the roads
 * you walk read first. OpenFreeMap vector tiles (OpenMapTiles schema), no API key.
 */

const OFM = "https://tiles.openfreemap.org";
const HALO = "rgba(4, 8, 7, 0.9)";
const LABEL = "#d7e6dc";
const LABEL_DIM = "#7e9287";
const PARK = "#163a29";

/** Width that grows with zoom, like a street does as you approach it. */
const w = (z13: number, z16: number, z18: number): ExpressionSpecification => [
  "interpolate",
  ["exponential", 1.6],
  ["zoom"],
  13,
  z13,
  16,
  z16,
  18,
  z18,
];

const road = (classes: string[]): ExpressionSpecification =>
  ["all", ["in", ["get", "class"], ["literal", classes]], ["!=", ["get", "brunnel"], "tunnel"]] as ExpressionSpecification;

export const streetNight: StyleSpecification = {
  version: 8,
  name: "street-night",
  projection: { type: "globe" },
  glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
  sources: {
    omt: {
      type: "vector",
      url: `${OFM}/planet`,
      attribution:
        '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://openmaptiles.org" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://openstreetmap.org" target="_blank" rel="noopener">OpenStreetMap</a>',
    },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#0e1a14" } },
    { id: "wood", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "wood"], paint: { "fill-color": "#13291e", "fill-opacity": 0.9 } },
    { id: "grass", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "grass"], paint: { "fill-color": "#173124" } },
    { id: "farmland", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "farmland"], paint: { "fill-color": "#1a3122" } },
    { id: "ice", type: "fill", source: "omt", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": "#21332a" } },
    {
      id: "urban",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["residential", "suburb", "neighbourhood", "quarter"]]],
      paint: { "fill-color": "#13231a" },
    },
    {
      id: "retail",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["commercial", "retail"]]],
      paint: { "fill-color": "#182b1f", "fill-opacity": 0.85 },
    },
    {
      id: "sport",
      type: "fill",
      source: "omt",
      "source-layer": "landuse",
      filter: ["in", ["get", "class"], ["literal", ["stadium", "pitch", "playground", "track", "theme_park", "zoo"]]],
      paint: { "fill-color": PARK },
    },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", paint: { "fill-color": PARK, "fill-opacity": 0.9 } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: { "fill-color": "#05100c" } },
    { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", paint: { "line-color": "#103828", "line-width": w(1, 3, 6) } },
    {
      id: "border",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "rgba(43, 227, 106, 0.28)", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.6, 8, 1.6] },
    },
    {
      id: "rail",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: road(["rail"]),
      paint: { "line-color": "#2a4536", "line-width": w(0.8, 1.8, 3.4) },
    },
    {
      id: "minor",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: road(["minor", "service"]),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#32503e", "line-width": w(0.9, 4.5, 12) },
    },
    {
      id: "mid",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: road(["tertiary", "secondary"]),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#41654e", "line-width": w(1.6, 8, 18) },
    },
    {
      id: "primary-glow",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: road(["primary", "trunk", "motorway"]),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#0e5b2c", "line-width": w(3.6, 15, 32) },
    },
    {
      id: "primary",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: road(["primary", "trunk", "motorway"]),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#2be36a", "line-width": w(2.3, 12, 27), "line-opacity": 0.75 },
    },
    { id: "building", type: "fill", source: "omt", "source-layer": "building", minzoom: 13, paint: { "fill-color": "#1e3527", "fill-opacity": 0.85 } },
    {
      id: "label-country",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: ["==", ["get", "class"], "country"],
      maxzoom: 7,
      layout: {
        "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]],
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 1, 9, 5, 13],
        "text-letter-spacing": 0.09,
        "text-transform": "uppercase",
      },
      paint: { "text-color": LABEL, "text-halo-color": HALO, "text-halo-width": 1.4 },
    },
    {
      id: "label-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: ["all", ["==", ["get", "class"], "city"], ["<=", ["get", "rank"], 6]],
      minzoom: 3,
      maxzoom: 12,
      layout: { "text-field": ["coalesce", ["get", "name:en"], ["get", "name"]], "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": LABEL, "text-halo-color": HALO, "text-halo-width": 1.3 },
    },
    {
      id: "label-place",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      filter: ["in", ["get", "class"], ["literal", ["suburb", "neighbourhood", "quarter"]]],
      minzoom: 11,
      layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
      paint: { "text-color": LABEL_DIM, "text-halo-color": HALO, "text-halo-width": 1.3 },
    },
    {
      id: "label-road",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      minzoom: 15,
      filter: ["in", ["get", "class"], ["literal", ["primary", "secondary", "tertiary", "minor"]]],
      layout: {
        "symbol-placement": "line",
        "text-field": ["get", "name"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 15, 10, 17, 12],
        "text-max-angle": 30,
        "symbol-spacing": 400,
      },
      paint: { "text-color": LABEL_DIM, "text-halo-color": HALO, "text-halo-width": 1.3 },
    },
  ],
};
