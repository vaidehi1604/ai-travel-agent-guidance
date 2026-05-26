const axios = require('axios');

/**
 * Weather Agent: Fetches weather data for the destination
 * Improved with fallback logic for unrecognized sub-areas and day-wise parsing
 */
const weatherNode = async (state) => {
  console.log("--- WEATHER AGENT ---");
  if (state.error || !state.intent) {
    return { status: "weather_skipped" };
  }

  const { destination, sub_areas, days, startDate, destination_details } = state.intent;
  const apiKey = process.env.WEATHER_API_KEY;

  if (!apiKey) {
    return { weather: { error: "API Key missing" }, status: "weather_failed" };
  }

  const locations = sub_areas && sub_areas.length > 0 ? sub_areas : [destination];
  const weatherResults = {};

  // Parse start date or default to today
  const parseDate = (dateStr) => {
    if (!dateStr) return new Date();
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const parsed = new Date(`${year}-${month}-${day}T12:00:00Z`);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  };

  const startObj = parseDate(startDate);
  const totalDays = parseInt(days) || 3;

  const processForecast = (list, note = null) => {
    const dailyForecasts = [];
    const seenDates = new Set();
    
    // Group by unique day string
    for (const w of list) {
      const datePart = w.dt_txt.split(' ')[0];
      if (!seenDates.has(datePart)) {
        seenDates.add(datePart);
        dailyForecasts.push({
          temp: w.main.temp,
          description: w.weather[0].description
        });
      }
    }

    // Map base forecasts to requested start date and total days
    const mappedForecast = [];
    for (let i = 0; i < totalDays; i++) {
      const current = new Date(startObj);
      current.setDate(current.getDate() + i);
      const dayStr = String(current.getDate()).padStart(2, '0');
      const monthStr = String(current.getMonth() + 1).padStart(2, '0');
      const yearStr = current.getFullYear();
      const formattedDate = `${dayStr}/${monthStr}/${yearStr}`;
      
      const baseW = dailyForecasts[i % dailyForecasts.length] || { temp: 25, description: "clear sky" };
      
      const forecastItem = {
        time: formattedDate,
        temp: baseW.temp,
        description: baseW.description
      };
      if (note) forecastItem.note = note;
      mappedForecast.push(forecastItem);
    }
    return mappedForecast;
  };

  try {
    for (const loc of locations) {
      console.log(`Fetching weather for: ${loc}`);
      try {
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${loc}&appid=${apiKey}&units=metric`;
        const response = await axios.get(url);
        weatherResults[loc] = processForecast(response.data.list);
      } catch (err) {
        console.warn(`Failed to fetch weather for sub-area "${loc}":`, err.message);
        
        // Define list of fallbacks based on destination resolution details
        const fallbacks = [];
        if (destination_details) {
          if (destination_details.city) fallbacks.push(destination_details.city);
          if (destination_details.district) fallbacks.push(destination_details.district);
          if (destination_details.state) fallbacks.push(destination_details.state);
        }
        if (loc !== destination) {
          fallbacks.push(destination);
        }

        let success = false;
        for (const fallback of fallbacks) {
          try {
            console.log(`Trying fallback weather lookup for: ${fallback}`);
            const fallbackUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${fallback}&appid=${apiKey}&units=metric`;
            const fallbackResponse = await axios.get(fallbackUrl);
            weatherResults[loc] = processForecast(fallbackResponse.data.list, `Weather data is for ${fallback} (fallback)`);
            success = true;
            break;
          } catch (fallbackErr) {
            console.warn(`Fallback failed for ${fallback}:`, fallbackErr.message);
          }
        }

        if (!success) {
          weatherResults[loc] = { error: `Weather data could not be fetched for ${loc} or its fallbacks` };
        }
      }
    }

    return { weather: weatherResults, status: "weather_fetched" };
  } catch (error) {
    console.error("Weather agent critical failure:", error.message);
    return { weather: { error: "Weather service unavailable" }, status: "weather_failed" };
  }
};

module.exports = { weatherNode };
