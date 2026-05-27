const axios = require('axios');

/**
 * Weather Agent
 * - OpenWeather → next 5 days
 * - Visual Crossing → future dates
 */
const weatherNode = async (state) => {

  console.log("--- WEATHER AGENT ---");

  if (state.error || !state.intent) {
    return { status: "weather_skipped" };
  }

  const {
    destination,
    sub_areas,
    days,
    startDate,
    destination_details
  } = state.intent;

  const openWeatherApiKey =
    process.env.WEATHER_API_KEY;

  const visualCrossingApiKey =
    process.env.VISUAL_CROSSING_API_KEY;

  if (!openWeatherApiKey) {
    return {
      weather: {
        error: "OpenWeather API Key missing"
      },
      status: "weather_failed"
    };
  }

  const locations =
    sub_areas && sub_areas.length > 0
      ? sub_areas
      : [destination];

  const weatherResults = {};

  /**
   * Better date parser
   */
  const parseDate = (dateStr) => {

    if (!dateStr) {
      return new Date();
    }

    const parsed = new Date(dateStr);

    if (!isNaN(parsed.getTime())) {
      return parsed;
    }

    return new Date();
  };

  const startObj = parseDate(startDate);

  const totalDays =
    parseInt(days) || 3;

  /**
   * Detect future trips
   */
  const today = new Date();

  const diffDays = Math.ceil(
    (startObj - today) /
    (1000 * 60 * 60 * 24)
  );

  /**
   * Process OpenWeather response
   */
  const processForecast = (
    list,
    note = null
  ) => {

    const dailyForecasts = [];
    const seenDates = new Set();

    for (const w of list) {

      const datePart =
        w.dt_txt.split(' ')[0];

      if (!seenDates.has(datePart)) {

        seenDates.add(datePart);

        dailyForecasts.push({
          temp: w.main.temp,
          description:
            w.weather[0].description
        });
      }
    }

    const mappedForecast = [];

    for (let i = 0; i < totalDays; i++) {

      const current =
        new Date(startObj);

      current.setDate(
        current.getDate() + i
      );

      const formattedDate =
        current.toLocaleDateString(
          'en-GB'
        );

      const baseW =
        dailyForecasts[
          i % dailyForecasts.length
        ] || {
          temp: 25,
          description: "clear sky"
        };

      mappedForecast.push({
        time: formattedDate,
        temp: baseW.temp,
        description:
          baseW.description,
        note
      });
    }

    return mappedForecast;
  };

  try {

    /**
     * FUTURE WEATHER
     * Use Visual Crossing
     */
    if (
      diffDays > 5 &&
      visualCrossingApiKey
    ) {

      console.log(
        "--- USING VISUAL CROSSING ---"
      );

      for (const loc of locations) {

        try {

          const formattedDate =
            startObj
              .toISOString()
              .split('T')[0];

          const vcUrl =
`https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${loc}/${formattedDate}?unitGroup=metric&include=days&key=${visualCrossingApiKey}&contentType=json`;

          const vcResponse =
            await axios.get(vcUrl);

          weatherResults[loc] =
            vcResponse.data.days
              .slice(0, totalDays)
              .map(day => ({
                time: day.datetime,
                temp: day.temp,
                tempmax: day.tempmax,
                tempmin: day.tempmin,
                description:
                  day.conditions,
                humidity:
                  day.humidity,
                snowfall:
                  day.snow || 0,
                precipitation:
                  day.precip || 0
              }));

        } catch (vcError) {

          console.warn(
            `Visual Crossing failed for ${loc}:`,
            vcError.message
          );

          weatherResults[loc] = {
            error:
              "Future weather unavailable"
          };
        }
      }

      return {
        weather: weatherResults,
        status:
          "future_weather_fetched"
      };
    }

    /**
     * SHORT TERM WEATHER
     * Use OpenWeather
     */
    for (const loc of locations) {

      console.log(
        `Fetching OpenWeather for: ${loc}`
      );

      try {

        const url =
`https://api.openweathermap.org/data/2.5/forecast?q=${loc}&appid=${openWeatherApiKey}&units=metric`;

        const response =
          await axios.get(url);

        weatherResults[loc] =
          processForecast(
            response.data.list
          );

      } catch (err) {

        console.warn(
          `Failed weather for "${loc}":`,
          err.message
        );

        const fallbacks = [];

        if (destination_details) {

          if (
            destination_details.city
          ) {
            fallbacks.push(
              destination_details.city
            );
          }

          if (
            destination_details.district
          ) {
            fallbacks.push(
              destination_details.district
            );
          }

          if (
            destination_details.state
          ) {
            fallbacks.push(
              destination_details.state
            );
          }
        }

        if (loc !== destination) {
          fallbacks.push(destination);
        }

        let success = false;

        for (const fallback of fallbacks) {

          try {

            const fallbackUrl =
`https://api.openweathermap.org/data/2.5/forecast?q=${fallback}&appid=${openWeatherApiKey}&units=metric`;

            const fallbackResponse =
              await axios.get(
                fallbackUrl
              );

            weatherResults[loc] =
              processForecast(
                fallbackResponse.data.list,
                `Weather data is for ${fallback} (fallback)`
              );

            success = true;

            break;

          } catch (fallbackErr) {

            console.warn(
              `Fallback failed for ${fallback}:`,
              fallbackErr.message
            );
          }
        }

        if (!success) {

          weatherResults[loc] = {
            error:
              `Weather unavailable for ${loc}`
          };
        }
      }
    }

    return {
      weather: weatherResults,
      status: "weather_fetched"
    };

  } catch (error) {

    console.error(
      "Weather agent failure:",
      error.message
    );

    return {
      weather: {
        error:
          "Weather service unavailable"
      },
      status: "weather_failed"
    };
  }
};

module.exports = { weatherNode };