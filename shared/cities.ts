import { distanceM, type LatLng } from "./geo.ts";

/** Major cities, [name, lat, lng]. Coarse labels for stats, and the tour on the landing map. */
export const CITIES: [string, number, number][] = [
  ["New York", 40.7128, -74.006], ["Los Angeles", 34.0522, -118.2437], ["Chicago", 41.8781, -87.6298],
  ["Houston", 29.7604, -95.3698], ["Phoenix", 33.4484, -112.074], ["Philadelphia", 39.9526, -75.1652],
  ["San Antonio", 29.4241, -98.4936], ["San Diego", 32.7157, -117.1611], ["Dallas", 32.7767, -96.797],
  ["Austin", 30.2672, -97.7431], ["San Francisco", 37.7749, -122.4194], ["Seattle", 47.6062, -122.3321],
  ["Denver", 39.7392, -104.9903], ["Boston", 42.3601, -71.0589], ["Miami", 25.7617, -80.1918],
  ["Atlanta", 33.749, -84.388], ["Washington", 38.9072, -77.0369], ["Las Vegas", 36.1699, -115.1398],
  ["Toronto", 43.6532, -79.3832], ["Montreal", 45.5017, -73.5673], ["Vancouver", 49.2827, -123.1207],
  ["Mexico City", 19.4326, -99.1332], ["Guadalajara", 20.6597, -103.3496], ["Bogotá", 4.711, -74.0721],
  ["Lima", -12.0464, -77.0428], ["Santiago", -33.4489, -70.6693], ["Buenos Aires", -34.6037, -58.3816],
  ["São Paulo", -23.5505, -46.6333], ["Rio de Janeiro", -22.9068, -43.1729], ["Caracas", 10.4806, -66.9036],
  ["London", 51.5074, -0.1278], ["Manchester", 53.4808, -2.2426], ["Dublin", 53.3498, -6.2603],
  ["Paris", 48.8566, 2.3522], ["Lyon", 45.764, 4.8357], ["Marseille", 43.2965, 5.3698],
  ["Madrid", 40.4168, -3.7038], ["Barcelona", 41.3874, 2.1686], ["Lisbon", 38.7223, -9.1393],
  ["Porto", 41.1579, -8.6291], ["Amsterdam", 52.3676, 4.9041], ["Brussels", 50.8503, 4.3517],
  ["Berlin", 52.52, 13.405], ["Hamburg", 53.5511, 9.9937], ["Munich", 48.1351, 11.582],
  ["Frankfurt", 50.1109, 8.6821], ["Zurich", 47.3769, 8.5417], ["Vienna", 48.2082, 16.3738],
  ["Prague", 50.0755, 14.4378], ["Warsaw", 52.2297, 21.0122], ["Kraków", 50.0647, 19.945],
  ["Budapest", 47.4979, 19.0402], ["Bucharest", 44.4268, 26.1025], ["Sofia", 42.6977, 23.3219],
  ["Belgrade", 44.7866, 20.4489], ["Athens", 37.9838, 23.7275], ["Thessaloniki", 40.6401, 22.9444],
  ["Rome", 41.9028, 12.4964], ["Milan", 45.4642, 9.19], ["Naples", 40.8518, 14.2681],
  ["Copenhagen", 55.6761, 12.5683], ["Stockholm", 59.3293, 18.0686], ["Oslo", 59.9139, 10.7522],
  ["Helsinki", 60.1699, 24.9384], ["Tallinn", 59.437, 24.7536], ["Riga", 56.9496, 24.1052],
  ["Vilnius", 54.6872, 25.2797], ["Kyiv", 50.4501, 30.5234], ["Istanbul", 41.0082, 28.9784],
  ["Ankara", 39.9334, 32.8597], ["Tbilisi", 41.7151, 44.8271], ["Batumi", 41.6168, 41.6367],
  ["Yerevan", 40.1792, 44.4991], ["Baku", 40.4093, 49.8671], ["Tel Aviv", 32.0853, 34.7818],
  ["Dubai", 25.2048, 55.2708], ["Abu Dhabi", 24.4539, 54.3773], ["Doha", 25.2854, 51.531],
  ["Riyadh", 24.7136, 46.6753], ["Cairo", 30.0444, 31.2357], ["Casablanca", 33.5731, -7.5898],
  ["Lagos", 6.5244, 3.3792], ["Accra", 5.6037, -0.187], ["Nairobi", -1.2921, 36.8219],
  ["Johannesburg", -26.2041, 28.0473], ["Cape Town", -33.9249, 18.4241], ["Karachi", 24.8607, 67.0011],
  ["Lahore", 31.5204, 74.3587], ["Delhi", 28.7041, 77.1025], ["Mumbai", 19.076, 72.8777],
  ["Bengaluru", 12.9716, 77.5946], ["Hyderabad", 17.385, 78.4867], ["Chennai", 13.0827, 80.2707],
  ["Kolkata", 22.5726, 88.3639], ["Dhaka", 23.8103, 90.4125], ["Kathmandu", 27.7172, 85.324],
  ["Colombo", 6.9271, 79.8612], ["Bangkok", 13.7563, 100.5018], ["Ho Chi Minh City", 10.8231, 106.6297],
  ["Hanoi", 21.0278, 105.8342], ["Kuala Lumpur", 3.139, 101.6869], ["Singapore", 1.3521, 103.8198],
  ["Jakarta", -6.2088, 106.8456], ["Manila", 14.5995, 120.9842], ["Hong Kong", 22.3193, 114.1694],
  ["Taipei", 25.033, 121.5654], ["Shanghai", 31.2304, 121.4737], ["Beijing", 39.9042, 116.4074],
  ["Shenzhen", 22.5431, 114.0579], ["Seoul", 37.5665, 126.978], ["Busan", 35.1796, 129.0756],
  ["Tokyo", 35.6762, 139.6503], ["Osaka", 34.6937, 135.5023], ["Sydney", -33.8688, 151.2093],
  ["Melbourne", -37.8136, 144.9631], ["Brisbane", -27.4698, 153.0251], ["Perth", -31.9505, 115.8605],
  ["Auckland", -36.8485, 174.7633], ["Almaty", 43.222, 76.8512], ["Tashkent", 41.2995, 69.2401],
];

/**
 * Nearest major city within 60 km, without sending anyone's position to a geocoder.
 * Beyond that the catch is labelled "Near <city>" so it still counts once.
 */
export function cityFor(p: LatLng): string {
  let best = "";
  let bestD = Infinity;
  for (const [name, lat, lng] of CITIES) {
    const d = distanceM(p, { lat, lng });
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return bestD <= 60_000 ? best : `Near ${best}`;
}

export function cityCoords(name: string): LatLng | null {
  const n = name.replace(/^Near /, "");
  const c = CITIES.find(([cn]) => cn === n);
  return c ? { lat: c[1], lng: c[2] } : null;
}
