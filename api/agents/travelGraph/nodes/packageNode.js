const { llm } = require("../../../../config/llm");
const { SystemMessage, HumanMessage } = require("@langchain/core/messages");
const { safeJsonParse } = require("../../../../utils/jsonParser");

/**
 * Slugify helper to convert text into valid URL slugs
 */
const slugify = (text) => {
    return (text || "")
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-');        // Replace multiple - with single -
};

/**
 * Travel Package Recommendation Agent
 */
const packageNode = async (state) => {
    try {
        console.log("--> Package Generator Node");
        const { intent, areas, travel, budget } = state;
        const { destination, sub_areas, startDate, days, budget: budgetVal, persons, preferences } = intent;

        const calculateEndDate = (startDateStr, daysNum) => {
            if (!startDateStr) return "Flexible";
            const parts = startDateStr.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts.map(Number);
                const date = new Date(y, m - 1, d);
                date.setDate(date.getDate() + (parseInt(daysNum) || 3));
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}/${month}/${year}`;
            }
            return "Flexible";
        };

        const endDate = calculateEndDate(startDate, days);
        const resolvedDest = intent.destination_details && intent.destination_details.full_address
            ? intent.destination_details.full_address
            : destination;

        // Clean destination (without country/state tags for URL building)
        const cleanDest = destination;

        const systemPrompt = `You are a Travel Package Recommendation Agent.

Your job is to find the best travel packages for the user's destination and trip dates from trusted travel platforms like Viator, MakeMyTrip, Thrillophilia, Holidify, Yatra, Goibibo, Thomas Cook, Booking.com Experiences, or similar providers.

IMPORTANT:
- Focus on LOWEST COST and BEST VALUE packages.
- Return only real and relevant travel/activity/tour packages for the destination.
- Prefer packages with:
  - lowest price
  - good ratings
  - inclusions (hotel, transport, sightseeing, meals, guide, activities)
  - verified providers
- Avoid duplicate packages.
- Prioritize packages matching the user's trip duration and interests.

TASKS:
1. Suggest real or highly realistic travel packages/activities/tours.
2. Find cheapest and most relevant packages.
3. Compare package prices and inclusions.
4. Return minimum 5 package options if available.
5. In your response, fill the bookingUrl/url field with a placeholder (we will overwrite it programmatically with website-wise URL rules).

Return ONLY a valid JSON object in the following format:
{
  "status": "success",
  "destination": "${destination}",
  "packages": [
    {
      "title": "Package Title",
      "provider": "Thomas Cook | MakeMyTrip | Thrillophilia | Yatra | Goibibo | Viator | Booking.com",
      "price": "Approximate Price in INR (integer, e.g., 8500)",
      "currency": "INR",
      "duration": "Duration (e.g., '5 Days / 4 Nights')",
      "rating": "Rating (e.g., '4.6/5')",
      "inclusions": ["Inclusion 1", "Inclusion 2"],
      "highlights": ["Highlight 1", "Highlight 2"],
      "packageType": "tour | activity | stay | combo",
      "source": "Thomas Cook | MakeMyTrip | Thrillophilia | Yatra | Goibibo | Viator | Booking.com"
    }
  ]
}

RULES:
- Return practical packages only.
- Prefer INR pricing.
- Keep package titles short and clean.
- If exact packages are unavailable, return closest nearby options.
- Do not hallucinate unavailable providers.
- Always include source platform name.`;

        const humanPrompt = `User Trip Details:
- Destination: ${resolvedDest}
- Sub Areas: ${JSON.stringify(sub_areas || [])}
- Start Date: ${startDate || "Flexible"}
- End Date: ${endDate}
- Number of Days: ${days}
- Budget: ${budgetVal} INR
- Travelers: ${persons || 2}
- Interests: ${preferences || "Sightseeing and exploring popular attractions"}`;

        const response = await llm.invoke([
            new SystemMessage(systemPrompt),
            new HumanMessage(humanPrompt)
        ]);

        let parsedData = safeJsonParse(response.content);
        let packagesData = [];

        if (parsedData && Array.isArray(parsedData.packages)) {
            packagesData = parsedData.packages;
        } else if (Array.isArray(parsedData)) {
            packagesData = parsedData;
        } else {
            console.warn("Unexpected packages response format, using fallback mapping");
            if (parsedData && typeof parsedData === 'object') {
                const keys = Object.keys(parsedData);
                const arrayKey = keys.find(k => Array.isArray(parsedData[k]));
                if (arrayKey) {
                    packagesData = parsedData[arrayKey];
                }
            }
        }

        // Programmatic URL generator strictly following website-wise formats
        const buildBookingUrl = (providerName, destinationName, sourceCity, startDateVal, pkgPrice) => {
            const dest = destinationName || "Bali";
            const destSlug = slugify(dest);
            const src = sourceCity || "Ahmedabad";
            
            // Format start date as DD/MM/YYYY
            let dateStr = "13/07/2026"; // Fallback future date
            if (startDateVal) {
                const match = startDateVal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
                if (match) {
                    dateStr = startDateVal;
                }
            }

            const priceNum = parseInt(String(pkgPrice || "").replace(/[^0-9]/g, "")) || 35000;
            // Thrillophilia specific pricing boundaries
            const minPrice = Math.max(1000, Math.floor(priceNum * 0.8));
            const maxPrice = Math.max(minPrice + 10000, Math.floor(priceNum * 1.5));

            const cleanSource = (providerName || "").toLowerCase();

            // 1. Thomas Cook
            if (cleanSource.includes("thomas cook") || cleanSource.includes("thomascook")) {
                const isIndia = ["india", "goa", "kerala", "rajasthan", "himachal", "uttarakhand", "kashmir", "ladakh", "sikkim", "gujarat", "mumbai", "delhi", "kedarnath", "kedarkantha"].some(kw => destSlug.includes(kw));
                const category = isIndia ? "india-tour-packages" : "international-tour-packages";
                return `https://www.thomascook.in/holidays/${category}/${destSlug}-tour-packages`;
            }

            // 2. MakeMyTrip Holidays
            if (cleanSource.includes("makemytrip") && !cleanSource.includes("gi")) {
                return `https://holidayz.makemytrip.com/holidays/india/search?depCity=${encodeURIComponent(src)}&dateSearched=${encodeURIComponent(dateStr)}&dest=${encodeURIComponent(dest)}&destValue=${encodeURIComponent(dest)}&glp=true&pdo=true&affiliate=MMT&rooms=1,0,0,0,,,`;
            }

            // 3. Thrillophilia
            if (cleanSource.includes("thrillophilia")) {
                return `https://www.thrillophilia.com/packages/${destSlug}-state-area_under-INR-${minPrice}-and-${maxPrice}?price=${minPrice}&price=${maxPrice}&names=${encodeURIComponent(dest)}&slugs=${destSlug}-state&is_search_page=true`;
            }

            // 4. Yatra Holidays
            if (cleanSource.includes("yatra")) {
                return `https://packages.yatra.com/holidays/intl/search.htm?destination=${encodeURIComponent(dest)}`;
            }

            // 5. Goibibo / MakeMyTrip GI Holidays
            if (cleanSource.includes("goibibo") || cleanSource.includes("gi holidays") || cleanSource.includes("giholidays")) {
                return `https://giholidays.makemytrip.com/holidays/india/search?dest=${encodeURIComponent(dest)}`;
            }

            // 6. Viator Fallback
            if (cleanSource.includes("viator")) {
                return `https://www.viator.com/searchResults/all?text=${encodeURIComponent(dest)}`;
            }

            // 7. Booking.com Fallback
            if (cleanSource.includes("booking")) {
                return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}`;
            }

            // Default fallback
            return `https://www.google.com/search?q=${encodeURIComponent(dest + " travel package " + (providerName || ""))}`;
        };

        // Fallback packages if empty
        if (packagesData.length === 0) {
            packagesData = [
                {
                    title: `Ultimate ${cleanDest} Package`,
                    provider: "MakeMyTrip",
                    price: "45000",
                    currency: "INR",
                    duration: `${days} Days`,
                    rating: "4.7/5",
                    inclusions: ["Flights", "Hotel", "Breakfast", "Sightseeing"],
                    highlights: ["All-inclusive tour", "Local guided tours", "Flexible dates"],
                    packageType: "combo",
                    source: "MakeMyTrip"
                },
                {
                    title: `${cleanDest} Sightseeing Tour`,
                    provider: "Thrillophilia",
                    price: "15000",
                    currency: "INR",
                    duration: "3 Days",
                    rating: "4.5/5",
                    inclusions: ["Stay", "Breakfast", "Guide", "Sightseeing"],
                    highlights: ["Nature walks", "Historical monuments", "Photography tour"],
                    packageType: "tour",
                    source: "Thrillophilia"
                },
                {
                    title: `Best of ${cleanDest} Tour`,
                    provider: "Thomas Cook",
                    price: "52000",
                    currency: "INR",
                    duration: `${days} Days`,
                    rating: "4.6/5",
                    inclusions: ["Accommodation", "All Meals", "Transfers", "Sightseeing"],
                    highlights: ["Luxury stays", "Premium activities", "Bilingual guides"],
                    packageType: "combo",
                    source: "Thomas Cook"
                }
            ];
        }

        // Apply URL rules to all packages
        packagesData = packagesData.map(pkg => {
            const providerName = pkg.source || pkg.provider || "";
            const generatedUrl = buildBookingUrl(
                providerName,
                cleanDest,
                intent.source,
                startDate,
                pkg.price
            );
            
            // Set both fields to avoid potential mapping issues in frontend/database
            pkg.bookingUrl = generatedUrl;
            pkg.url = generatedUrl;
            return pkg;
        });

        return { packages: packagesData };
    } catch (error) {
        console.error("PackageNode Error:", error);
        return { packages: [] };
    }
};

module.exports = { packageNode };
