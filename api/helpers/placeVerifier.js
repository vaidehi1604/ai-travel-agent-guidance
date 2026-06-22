const axios = require('axios');

/**
 * Verifies a Geoapify Place ID and retrieves canonical city information.
 * If GEOAPIFY_PLACES_API_KEY is not defined, it uses a mock fallback database.
 * 
 * @param {string} placeId 
 * @returns {Promise<{cityName: string, placeId: string, latitude: number, longitude: number, country: string, state?: string}>}
 */
async function verifyPlaceId(placeId) {
  const apiKey = process.env.GEOAPIFY_PLACES_API_KEY;

  if (!apiKey) {
    console.warn("⚠️ GEOAPIFY_PLACES_API_KEY is not defined in environment. Using fallback mock verification.");
    
    // Quick mock database for common test cities
    const mockPlaces = {
      'mock_ahmedabad': {
        cityName: 'Ahmedabad',
        placeId: 'mock_ahmedabad',
        latitude: 23.0225,
        longitude: 72.5714,
        country: 'India',
        state: 'Gujarat'
      },
      'mock_dallas': {
        cityName: 'Dallas',
        placeId: 'mock_dallas',
        latitude: 32.7767,
        longitude: -96.7970,
        country: 'United States',
        state: 'Texas'
      },
      'mock_paris': {
        cityName: 'Paris',
        placeId: 'mock_paris',
        latitude: 48.8566,
        longitude: 2.3522,
        country: 'France',
        state: 'Île-de-France'
      },
      'mock_london': {
        cityName: 'London',
        placeId: 'mock_london',
        latitude: 51.5074,
        longitude: -0.1278,
        country: 'United Kingdom',
        state: 'England'
      },
      'mock_mumbai': {
        cityName: 'Mumbai',
        placeId: 'mock_mumbai',
        latitude: 19.0760,
        longitude: 72.8777,
        country: 'India',
        state: 'Maharashtra'
      },
      'mock_new_york': {
        cityName: 'New York',
        placeId: 'mock_new_york',
        latitude: 40.7128,
        longitude: -74.0060,
        country: 'United States',
        state: 'New York'
      }
    };

    const key = placeId.toLowerCase();
    if (mockPlaces[key]) {
      return mockPlaces[key];
    }

    // Default mock response if key is random
    const parts = placeId.replace('mock_', '').split('_');
    const name = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : 'Mock City';
    return {
      cityName: name,
      placeId: placeId,
      latitude: 37.7749,
      longitude: -122.4194,
      country: 'Mock Country',
      state: 'Mock State'
    };
  }

  try {
    const response = await axios.get('https://api.geoapify.com/v2/place-details', {
      params: {
        id: placeId,
        apiKey: apiKey
      }
    });

    const features = response.data?.features;
    if (!features || features.length === 0) {
      throw new Error(`Geoapify API did not return details for Place ID: ${placeId}`);
    }

    const properties = features[0].properties;
    
    // Determine the city name (checking hierarchy of possible properties)
    const cityName = properties.city || properties.village || properties.town || properties.name || 'Unknown City';
    const country = properties.country || 'Unknown Country';
    const state = properties.state || '';

    // Coordinates are in properties.lat and properties.lon, or geometry.coordinates [lon, lat]
    const latitude = properties.lat || features[0].geometry?.coordinates?.[1];
    const longitude = properties.lon || features[0].geometry?.coordinates?.[0];

    if (latitude === undefined || longitude === undefined) {
      throw new Error('Could not retrieve coordinates for the selected city from Geoapify.');
    }

    return {
      cityName,
      placeId,
      state,
      country,
      latitude: Number(latitude),
      longitude: Number(longitude)
    };
  } catch (error) {
    console.error('Error verifying Geoapify Place ID:', error.message);
    throw new Error(`Invalid place selection: ${error.message}`);
  }
}

module.exports = { verifyPlaceId };
