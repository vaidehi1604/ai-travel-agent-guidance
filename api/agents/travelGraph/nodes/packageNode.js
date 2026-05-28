const { llm } = require('../../../../config/llm');
const { SystemMessage, HumanMessage } = require('@langchain/core/messages');
const { safeJsonParse } = require('../../../../utils/jsonParser');

/**
 * Slugify helper to convert text into valid URL slugs
 */
const slugify = (text) => {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-'); // Replace multiple - with single -
};

/**
 * Travel Package Recommendation Agent
 */
const packageNode = async (state) => {
  try {
    console.log('--> Package Generator Node');
    const { intent, areas, travel, budget } = state;
    const {
      destination,
      sub_areas,
      startDate,
      days,
      budget: budgetVal,
      persons,
      preferences,
    } = intent;

    const calculateEndDate = (startDateStr, daysNum) => {
      if (!startDateStr) return 'Flexible';
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
      return 'Flexible';
    };

    const endDate = calculateEndDate(startDate, days);
    const resolvedDest =
      intent.destination_details && intent.destination_details.full_address
        ? intent.destination_details.full_address
        : destination;

    // Clean destination (without country/state tags for URL building)
    const cleanDest = destination;

    const systemPrompt = `You are a Travel Package Recommendation Agent.

Your job is to find the best travel packages for the user's destination and trip dates from trusted travel platforms like Thrillophilia, MakeMyTrip, Yatra, Goibibo, Thomas Cook, Viator, Booking.com Experiences, or similar providers.

IMPORTANT:
- Focus on LOWEST COST and BEST VALUE packages.
- Return only real and relevant travel/activity/tour packages for the destination.
- Estimate prices realistically: the price must be a realistic estimate of the starting package cost for the specified destination, duration, and number of travelers. For international destinations (e.g., Dubai, Bali, Maldives, Europe), the price should account for standard travel costs (flights, hotels, activities) and reflect realistic market prices (e.g., usually starting from at least 40,000 INR to 80,000 INR per person for a multi-day trip including flights). Do not return unrealistically low prices.
- Prefer packages with:
  - lowest price (that is realistic for the destination and duration)
  - good ratings
  - inclusions (hotel, transport, sightseeing, meals, guide, activities)
  - verified providers
- Avoid duplicate packages.
- Prioritize packages matching the user's trip duration and interests.
- If the user's interests include honeymoon or romantic, include at least one Thrillophilia honeymoon package.

TASKS:
1. Suggest real or highly realistic travel packages/activities/tours.
2. Find cheapest and most relevant packages.
3. Compare package prices and inclusions.
4. Return minimum 5 package options if available.
5. In your response, fill the bookingUrl/url field with a placeholder (we will overwrite it programmatically with website-wise URL rules).

  CRITICAL: Return ONLY a valid JSON object matching the format below. Do NOT include any introductory, conversational, or concluding text (e.g., do NOT start with "Based on the...", and do NOT include any trailing notes or explanations). You must output nothing else except the raw JSON structure.

  Format:
  {
    "status": "success",
    "destination": "${destination}",
    "packages": [
      {
        "title": "Package Title",
        "provider": "Thrillophilia | Thomas Cook | MakeMyTrip | Yatra | Goibibo | Viator | Booking.com",
        "price": "Approximate starting price in INR per person (integer, e.g., 45000)",
        "currency": "INR",
        "duration": "Duration (e.g., '5 Days / 4 Nights')",
        "rating": "Rating (e.g., '4.6/5')",
        "inclusions": ["Inclusion 1", "Inclusion 2"],
        "highlights": ["Highlight 1", "Highlight 2"],
        "packageType": "tour | activity | stay | combo",
        "source": "Thrillophilia | Thomas Cook | MakeMyTrip | Yatra | Goibibo | Viator | Booking.com"
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
- Start Date: ${startDate || 'Flexible'}
- End Date: ${endDate}
- Number of Days: ${days}
- Budget: ${budgetVal} INR
- Travelers: ${persons || 2}
- Interests: ${preferences || 'Sightseeing and exploring popular attractions'}`;

    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(humanPrompt),
    ]);

    let parsedData = safeJsonParse(response.content);
    let packagesData = [];

    if (parsedData && Array.isArray(parsedData.packages)) {
      packagesData = parsedData.packages;
    } else if (Array.isArray(parsedData)) {
      packagesData = parsedData;
    } else {
      console.warn(
        'Unexpected packages response format, using fallback mapping'
      );
      if (parsedData && typeof parsedData === 'object') {
        const keys = Object.keys(parsedData);
        const arrayKey = keys.find((k) => Array.isArray(parsedData[k]));
        if (arrayKey) {
          packagesData = parsedData[arrayKey];
        }
      }
    }

    // Deduplicate packages by title
    const seenTitles = new Set();
    packagesData = packagesData.filter((pkg) => {
      const key = (pkg.title || '').toLowerCase().trim();
      if (seenTitles.has(key)) return false;
      seenTitles.add(key);
      return true;
    });

    /**
     * Compute a budget range from the client's stated budget.
     * Rule:
     *   min = max(20_000,  budget - 25_000)  → never below ₹20k
     *   max = ceil((budget + 5_000) / 10_000) * 10_000  → next ₹10k above budget+5k
     *
     * Examples:
     *   45,000 → min 20,000 / max 50,000
     *   30,000 → min 20,000 / max 40,000
     *   60,000 → min 35,000 / max 70,000
     */
    const computeBudgetRange = (rawBudget) => {
      const budget = parseInt(String(rawBudget || '').replace(/[^0-9]/g, '')) || 0;
      if (!budget) return null; // no budget provided → don't append filter
      const minBudget = Math.max(20000, budget - 25000);
      const maxBudget = Math.ceil((budget + 5000) / 10000) * 10000;
      return { minBudget, maxBudget };
    };

    // Programmatic URL generator strictly following website-wise formats
    const buildBookingUrl = (
      providerName,
      destinationName,
      sourceCity,
      startDateVal,
      pkgPrice,
      userPreferences,
      userBudget
    ) => {
      const dest = destinationName || 'Bali';
      const destSlug = slugify(dest);
      const src = sourceCity || 'Ahmedabad';

      // Format start date as DD/MM/YYYY
      let dateStr = '13/07/2026'; // Fallback future date
      if (startDateVal) {
        const match = startDateVal.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        if (match) {
          dateStr = startDateVal;
        }
      }

      const cleanSource = (providerName || '').toLowerCase();
      const prefLower = (userPreferences || '').toLowerCase();
      const isHoneymoon =
        prefLower.includes('honeymoon') || prefLower.includes('romantic');

      // ─────────────────────────────────────────────
      // 1. Thrillophilia – smart URL routing
      // ─────────────────────────────────────────────
      if (cleanSource.includes('thrillophilia')) {
        // Map of city slugs → Thrillophilia /cities/ path
        const thrilloCityMap = {
          dubai: 'dubai',
          manali: 'manali',
          goa: 'goa',
          kerala: 'kerala',
          shimla: 'shimla',
          mussoorie: 'mussoorie',
          ooty: 'ooty',
          munnar: 'munnar',
          jaipur: 'jaipur',
          udaipur: 'udaipur',
          ladakh: 'ladakh',
          kashmir: 'kashmir',
          singapore: 'singapore',
          bangkok: 'bangkok',
          phuket: 'phuket',
          'kuala lumpur': 'kuala-lumpur',
          maldives: 'maldives',
          mauritius: 'mauritius',
          istanbul: 'istanbul',
          paris: 'paris',
          london: 'london',
          swiss: 'swiss',
          switzerland: 'swiss',
          amsterdam: 'amsterdam',
          rishikesh: 'rishikesh',
          coorg: 'coorg',
          darjeeling: 'darjeeling',
          nainital: 'nainital',
          mcleod: 'mcleodganj',
          mcleodganj: 'mcleodganj',
          dharamshala: 'dharamshala',
          spiti: 'spiti',
          leh: 'leh',
        };

        // Map of state/region slugs → Thrillophilia /states/ path
        const thrilloStateMap = {
          bali: 'bali-state',
          rajasthan: 'rajasthan-state',
          himachal: 'himachal-pradesh-state',
          uttarakhand: 'uttarakhand-state',
          'north east': 'north-east-state',
          sikkim: 'sikkim-state',
          andaman: 'andaman-nicobar-state',
          'andaman and nicobar': 'andaman-nicobar-state',
          vietnam: 'vietnam-country',
          indonesia: 'indonesia-country',
          thailand: 'thailand-country',
          europe: 'europe-continent',
        };

        // Check if destination matches a city
        const cityKey = Object.keys(thrilloCityMap).find((k) =>
          destSlug.includes(k.replace(/\s+/g, '-'))
        );

        if (cityKey) {
          const cityPath = thrilloCityMap[cityKey];
          if (isHoneymoon) {
            return `https://www.thrillophilia.com/cities/${cityPath}/tags/honeymoon`;
          }
          return `https://www.thrillophilia.com/cities/${cityPath}/tours`;
        }

        // Check if destination matches a state/region
        const stateKey = Object.keys(thrilloStateMap).find((k) =>
          destSlug.includes(k.replace(/\s+/g, '-'))
        );

        if (stateKey) {
          const statePath = thrilloStateMap[stateKey];
          if (isHoneymoon) {
            return `https://www.thrillophilia.com/states/${statePath}/tags/honeymoon`;
          }
          return `https://www.thrillophilia.com/states/${statePath}/tours`;
        }

        // Generic Thrillophilia fallback using search
        const tag = isHoneymoon ? '/tags/honeymoon' : '/tours';
        return `https://www.thrillophilia.com/cities/${destSlug}${tag}`;
      }

      // ─────────────────────────────────────────────
      // 2. Thomas Cook
      // ─────────────────────────────────────────────
      if (
        cleanSource.includes('thomas cook') ||
        cleanSource.includes('thomascook')
      ) {
        const indiaDestinations = [
          'india', 'goa', 'kerala', 'rajasthan', 'himachal', 'uttarakhand',
          'kashmir', 'ladakh', 'sikkim', 'gujarat', 'mumbai', 'delhi',
          'kedarnath', 'kedarkantha', 'manali', 'shimla', 'mussoorie',
          'darjeeling', 'agra', 'varanasi', 'jaipur', 'udaipur', 'cochin',
          'rishikesh', 'ooty', 'coonoor', 'munnar', 'kochi', 'bangalore',
          'hyderabad',
        ];
        const isIndia = indiaDestinations.some((kw) => destSlug.includes(kw));
        const category = isIndia
          ? 'india-tour-packages'
          : 'international-tour-packages';
        const tcRange = computeBudgetRange(userBudget);
        const tcBudgetParam = tcRange
          ? `?filter_budgetRange=${tcRange.minBudget}-to-${tcRange.maxBudget}`
          : '';
        return `https://www.thomascook.in/holidays/${category}/${destSlug}-tour-packages${tcBudgetParam}`;
      }

      // ─────────────────────────────────────────────
      // 3. MakeMyTrip Holidays
      // ─────────────────────────────────────────────
      if (cleanSource.includes('makemytrip') && !cleanSource.includes('gi')) {
        const mmtRange = computeBudgetRange(userBudget);
        const mmtBudgetParam = mmtRange
          ? `&version=3&budget=${mmtRange.minBudget}_${mmtRange.maxBudget}`
          : '&version=3';
        return `https://holidayz.makemytrip.com/holidays/india/search?depCity=${encodeURIComponent(src)}&dateSearched=${encodeURIComponent(dateStr)}&dest=${encodeURIComponent(dest)}&destValue=${encodeURIComponent(dest)}&glp=true&pdo=true&affiliate=MMT&rooms=1%2C0%2C0%2C0%2C%2C%2C${mmtBudgetParam}`;
      }

      // ─────────────────────────────────────────────
      // 4. Yatra Holidays
      // ─────────────────────────────────────────────
      if (cleanSource.includes('yatra')) {
        return `https://packages.yatra.com/holidays/intl/search.htm?destination=${encodeURIComponent(dest)}`;
      }

      // ─────────────────────────────────────────────
      // 5. Goibibo / GI Holidays
      // ─────────────────────────────────────────────
      if (
        cleanSource.includes('goibibo') ||
        cleanSource.includes('gi holidays') ||
        cleanSource.includes('giholidays')
      ) {
        const giRange = computeBudgetRange(userBudget);
        const giBudgetParam = giRange
          ? `&version=3&budget=${giRange.minBudget}_${giRange.maxBudget}`
          : '&version=3';
        return `https://giholidays.makemytrip.com/holidays/india/search?dest=${encodeURIComponent(dest)}${giBudgetParam}`;
      }

      // ─────────────────────────────────────────────
      // 6. Viator
      // ─────────────────────────────────────────────
      if (cleanSource.includes('viator')) {
        return `https://www.viator.com/searchResults/all?text=${encodeURIComponent(dest)}`;
      }

      // ─────────────────────────────────────────────
      // 7. Booking.com
      // ─────────────────────────────────────────────
      if (cleanSource.includes('booking')) {
        return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}`;
      }

      // Default fallback
      return `https://www.google.com/search?q=${encodeURIComponent(dest + ' travel package ' + (providerName || ''))}`;
    };

    // Fallback packages if empty
    if (packagesData.length === 0) {
      packagesData = [
        {
          title: `Ultimate ${cleanDest} Package`,
          provider: 'MakeMyTrip',
          price: '45000',
          currency: 'INR',
          duration: `${days} Days`,
          rating: '4.7/5',
          inclusions: ['Flights', 'Hotel', 'Breakfast', 'Sightseeing'],
          highlights: [
            'All-inclusive tour',
            'Local guided tours',
            'Flexible dates',
          ],
          packageType: 'combo',
          source: 'MakeMyTrip',
        },

        {
          title: `Best of ${cleanDest} Tour`,
          provider: 'Thomas Cook',
          price: '52000',
          currency: 'INR',
          duration: `${days} Days`,
          rating: '4.6/5',
          inclusions: [
            'Accommodation',
            'All Meals',
            'Transfers',
            'Sightseeing',
          ],
          highlights: [
            'Luxury stays',
            'Premium activities',
            'Bilingual guides',
          ],
          packageType: 'combo',
          source: 'Thomas Cook',
        },
      ];
    }

    // Apply URL rules to all packages
    packagesData = packagesData.map((pkg) => {
      const providerName = pkg.source || pkg.provider || '';
      const generatedUrl = buildBookingUrl(
        providerName,
        cleanDest,
        intent.source,
        startDate,
        pkg.price,
        preferences,  // honeymoon/romantic detection
        budgetVal     // client's stated budget for range calculation
      );

      // Set both fields to avoid potential mapping issues in frontend/database
      pkg.bookingUrl = generatedUrl;
      pkg.url = generatedUrl;
      return pkg;
    });

    return { packages: packagesData };
  } catch (error) {
    console.error('PackageNode Error:', error);
    return { packages: [] };
  }
};

module.exports = { packageNode };
