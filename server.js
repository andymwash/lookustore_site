const express = require('express');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// In-memory database for live tracking sessions
const activeSessions = {};

// 1. Update Live Location (called by driver's app)
app.post('/api/track/update', (req, res) => {
  const { token, lat, lon, destination } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });
  
  activeSessions[token] = { lat, lon, destination, updatedAt: Date.now() };
  res.json({ success: true });
});

// 2. Fetch Live Location (called by viewers with tracking link)
app.get('/api/track/:token', (req, res) => {
  const { token } = req.params;
  const session = activeSessions[token];
  if (!session) return res.status(404).json({ error: 'Tracking session not found.' });
  
  res.json(session);
});

// 3. Routing & Hazard Assessment Endpoint
app.post('/api/route', async (req, res) => {
  const { start, destination } = req.body;

  if (!start || !destination) {
    return res.status(400).json({ error: "Both start location and destination are required." });
  }

  try {
    console.log(`Searching route from "${start}" to "${destination}"...`);

    const startCoords = await geocodeLocation(start);
    const destCoords = await geocodeLocation(destination);

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${startCoords.lon},${startCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=geojson`;
    const osrmRes = await axios.get(osrmUrl);
    
    if (!osrmRes.data.routes || osrmRes.data.routes.length === 0) {
      return res.status(400).json({ error: "No driving route found between these locations." });
    }

    const route = osrmRes.data.routes[0];
    
    res.json({
      hazardScore: Math.floor(Math.random() * 25), // Simulated low risk
      durationMinutes: Math.round(route.duration / 60),
      distanceKm: (route.distance / 1000).toFixed(1),
      geometry: route.geometry.coordinates
    });

  } catch (error) {
    console.error("Geocoding/Routing Error:", error.message);
    res.status(400).json({ error: error.message || "Failed to process route." });
  }
});

// Geocoder with auto-append for Kenyan locations
async function geocodeLocation(query) {
  let searchString = query.trim();
  
  if (!searchString.toLowerCase().includes('kenya')) {
    searchString += ', Kenya';
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchString)}`;
  
  const response = await axios.get(url, { 
    headers: { 'User-Agent': 'SafeRouteApp/1.0' } 
  });

  if (!response.data || response.data.length === 0) {
    throw new Error(`Could not find coordinates for "${query}". Please check the spelling.`);
  }

  return { 
    lat: parseFloat(response.data[0].lat), 
    lon: parseFloat(response.data[0].lon) 
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SafeRoute Navigation Backend running on http://localhost:${PORT}`);
});