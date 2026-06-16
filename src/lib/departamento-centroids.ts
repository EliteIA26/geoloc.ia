export type Centroide = { nombre: string; lat: number; lon: number };

// Computed once from public/data/departamentos.geojson (average of outer-ring
// coordinates per feature) — good enough for a forecast point per department.
export const CENTROIDES: Centroide[] = [
  { nombre: "Arauco", lon: -66.653, lat: -28.552 },
  { nombre: "Chilecito", lon: -67.323, lat: -29.399 },
  { nombre: "Famatina", lon: -67.612, lat: -28.55 },
  { nombre: "Castro Barros", lon: -66.922, lat: -28.888 },
  { nombre: "Capital", lon: -66.559, lat: -29.39 },
  { nombre: "Sanagasta", lon: -67.052, lat: -29.171 },
  { nombre: "San Blas de Los Sauces", lon: -67.143, lat: -28.508 },
  { nombre: "Chamical", lon: -65.982, lat: -30.197 },
  { nombre: "General Ortiz de Ocampo", lon: -66.207, lat: -30.996 },
  { nombre: "General Belgrano", lon: -66.057, lat: -30.554 },
  { nombre: "General Felipe Varela", lon: -68.59, lat: -29.443 },
  { nombre: "Rosario Vera Peñaloza", lon: -66.527, lat: -31.402 },
  { nombre: "Ángel Vicente Peñaloza", lon: -66.634, lat: -30.364 },
  { nombre: "General San Martín", lon: -66.279, lat: -31.775 },
  { nombre: "General Juan Facundo Quiroga", lon: -66.8, lat: -30.786 },
  { nombre: "Independencia", lon: -67.338, lat: -30.087 },
  { nombre: "Vinchina", lon: -68.533, lat: -28.096 },
  { nombre: "General Lamadrid", lon: -69.181, lat: -28.541 },
];
