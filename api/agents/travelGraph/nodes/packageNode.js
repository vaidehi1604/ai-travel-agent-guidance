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
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

/**
 * Travel Package Recommendation Agent
 * - Single destination → flat array (backward compatible)
 * - Multi-destination → grouped array: [{ destination, packages: [...] }, ...]
 */
const packageNode = async (state) => {
  try {
    console.log('--> Package Generator Node');
    const { intent } = state;
    const { destination, startDate, days, budget: budgetVal, persons, preferences } = intent;

    // ── Date helpers ─────────────────────────────────────────────────────────
    const calculateEndDate = (startDateStr, daysNum) => {
      if (!startDateStr) return 'Flexible';
      const parts = startDateStr.split('/');
      if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + (parseInt(daysNum) || 3));
        return `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
      }
      return 'Flexible';
    };
    const endDate = calculateEndDate(startDate, days);

    // ── Budget range calculator ───────────────────────────────────────────────
    // min = max(20k, budget-25k) | max = ceil((budget+5k)/10k)*10k
    // e.g. 45k → 20k/50k | 30k → 20k/40k
    const computeBudgetRange = (rawBudget) => {
      const b = parseInt(String(rawBudget || '').replace(/[^0-9]/g, '')) || 0;
      if (!b) return null;
      return {
        minBudget: Math.max(20000, b - 25000),
        maxBudget: Math.ceil((b + 5000) / 10000) * 10000,
      };
    };

    // ── Booking URL builder ───────────────────────────────────────────────────
    const buildBookingUrl = (providerName, destName, sourceCity, startDateVal, pkgPrice, userPrefs, userBudget) => {
      const dest    = destName || 'India';
      const destSlug = slugify(dest);
      const src     = sourceCity || 'Ahmedabad';
      let dateStr   = '13/07/2026';
      if (startDateVal && /^\d{2}\/\d{2}\/\d{4}$/.test(startDateVal)) dateStr = startDateVal;

      const src_lc  = (providerName || '').toLowerCase();
      const pref_lc = (userPrefs || '').toLowerCase();
      const isHoneymoon = pref_lc.includes('honeymoon') || pref_lc.includes('romantic');

      // 1. Thrillophilia
      if (src_lc.includes('thrillophilia')) {
        const cityMap = {
          dubai:'dubai', manali:'manali', goa:'goa', kerala:'kerala',
          shimla:'shimla', mussoorie:'mussoorie', ooty:'ooty', munnar:'munnar',
          jaipur:'jaipur', udaipur:'udaipur', ladakh:'ladakh', kashmir:'kashmir',
          singapore:'singapore', bangkok:'bangkok', phuket:'phuket',
          'kuala lumpur':'kuala-lumpur', maldives:'maldives', mauritius:'mauritius',
          istanbul:'istanbul', paris:'paris', london:'london',
          swiss:'swiss', switzerland:'swiss', amsterdam:'amsterdam',
          rishikesh:'rishikesh', coorg:'coorg', darjeeling:'darjeeling',
          nainital:'nainital', mcleod:'mcleodganj', mcleodganj:'mcleodganj',
          dharamshala:'dharamshala', spiti:'spiti', leh:'leh',
        };
        const stateMap = {
          bali:'bali-state', rajasthan:'rajasthan-state',
          himachal:'himachal-pradesh-state', uttarakhand:'uttarakhand-state',
          'north east':'north-east-state', sikkim:'sikkim-state',
          andaman:'andaman-nicobar-state', vietnam:'vietnam-country',
          indonesia:'indonesia-country', thailand:'thailand-country', europe:'europe-continent',
        };
        const cityKey  = Object.keys(cityMap).find(k => destSlug.includes(k.replace(/\s+/g,'-')));
        const stateKey = Object.keys(stateMap).find(k => destSlug.includes(k.replace(/\s+/g,'-')));
        if (cityKey)  return `https://www.thrillophilia.com/cities/${cityMap[cityKey]}/${isHoneymoon ? 'tags/honeymoon' : 'tours'}`;
        if (stateKey) return `https://www.thrillophilia.com/states/${stateMap[stateKey]}/${isHoneymoon ? 'tags/honeymoon' : 'tours'}`;
        return `https://www.thrillophilia.com/cities/${destSlug}/${isHoneymoon ? 'tags/honeymoon' : 'tours'}`;
      }

      // 2. Thomas Cook
      if (src_lc.includes('thomas cook') || src_lc.includes('thomascook')) {
        const indiaKw = ['india','goa','kerala','rajasthan','himachal','uttarakhand','kashmir','ladakh','sikkim','gujarat','mumbai','delhi','kedarnath','kedarkantha','manali','shimla','mussoorie','darjeeling','agra','varanasi','jaipur','udaipur','cochin','rishikesh','ooty','coonoor','munnar','kochi','bangalore','hyderabad','nainital','rishikesh'];
        const cat = indiaKw.some(kw => destSlug.includes(kw)) ? 'india-tour-packages' : 'international-tour-packages';
        const range = computeBudgetRange(userBudget);
        const budgetParam = range ? `?filter_budgetRange=${range.minBudget}-to-${range.maxBudget}` : '';
        return `https://www.thomascook.in/holidays/${cat}/${destSlug}-tour-packages${budgetParam}`;
      }

      // 3. MakeMyTrip
      if (src_lc.includes('makemytrip') && !src_lc.includes('gi')) {
        const range = computeBudgetRange(userBudget);
        const budgetParam = range ? `&version=3&budget=${range.minBudget}_${range.maxBudget}` : '&version=3';
        return `https://holidayz.makemytrip.com/holidays/india/search?depCity=${encodeURIComponent(src)}&dateSearched=${encodeURIComponent(dateStr)}&dest=${encodeURIComponent(dest)}&destValue=${encodeURIComponent(dest)}&glp=true&pdo=true&affiliate=MMT&rooms=1%2C0%2C0%2C0%2C%2C%2C${budgetParam}`;
      }

      // 4. Yatra
      if (src_lc.includes('yatra')) return `https://packages.yatra.com/holidays/intl/search.htm?destination=${encodeURIComponent(dest)}`;

      // 5. Goibibo / GI
      if (src_lc.includes('goibibo') || src_lc.includes('gi holidays') || src_lc.includes('giholidays')) {
        const range = computeBudgetRange(userBudget);
        const budgetParam = range ? `&version=3&budget=${range.minBudget}_${range.maxBudget}` : '&version=3';
        return `https://giholidays.makemytrip.com/holidays/india/search?dest=${encodeURIComponent(dest)}${budgetParam}`;
      }

      // 6. Viator
      if (src_lc.includes('viator')) return `https://www.viator.com/searchResults/all?text=${encodeURIComponent(dest)}`;

      // 7. Booking.com
      if (src_lc.includes('booking')) return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(dest)}`;

      return `https://www.google.com/search?q=${encodeURIComponent(dest + ' travel package ' + (providerName || ''))}`;
    };

    // ── Core: fetch packages for ONE destination ──────────────────────────────
    const fetchPackagesForDest = async (destName, maxPkgs = 5) => {
      const resolvedDest = (destName === destination && intent.destination_details?.full_address)
        ? intent.destination_details.full_address
        : destName;

      const systemPrompt = `You are a Travel Package Recommendation Agent.

Find the best travel packages for ${destName} from trusted platforms: Thrillophilia, MakeMyTrip, Yatra, Goibibo, Thomas Cook, Viator, Booking.com.

IMPORTANT:
- Focus on LOWEST COST and BEST VALUE packages for ${destName} specifically.
- Estimate prices realistically in INR.
- For international destinations, prices must include flights/hotels (min 40,000–80,000 INR per person).
- Avoid duplicate packages.
- If the user's interests include honeymoon or romantic, include at least one Thrillophilia honeymoon package.
- Return exactly ${maxPkgs} packages.

CRITICAL: Return ONLY a valid JSON object. No text before or after. Only raw JSON.

Format:
{
  "status": "success",
  "destination": "${destName}",
  "packages": [
    {
      "title": "Package Title",
      "provider": "Thrillophilia | Thomas Cook | MakeMyTrip | Yatra | Goibibo | Viator | Booking.com",
      "price": 45000,
      "currency": "INR",
      "duration": "5 Days / 4 Nights",
      "rating": "4.6/5",
      "inclusions": ["Hotel", "Breakfast"],
      "highlights": ["Key attraction"],
      "packageType": "tour | activity | stay | combo",
      "source": "Thrillophilia | Thomas Cook | MakeMyTrip | Yatra | Goibibo | Viator | Booking.com"
    }
  ]
}`;

      const humanPrompt = `User Trip Details:
- Destination: ${resolvedDest}
- Start Date: ${startDate || 'Flexible'}
- End Date: ${endDate}
- Days: ${days}
- Budget: ${budgetVal} INR
- Travelers: ${persons || 2}
- Interests: ${preferences || 'Sightseeing and exploring popular attractions'}`;

      const response = await llm.invoke([new SystemMessage(systemPrompt), new HumanMessage(humanPrompt)]);
      let parsed = safeJsonParse(response.content);
      let pkgs = [];

      if (parsed && Array.isArray(parsed.packages))       pkgs = parsed.packages;
      else if (Array.isArray(parsed))                      pkgs = parsed;
      else if (parsed && typeof parsed === 'object') {
        const key = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
        if (key) pkgs = parsed[key];
      }

      // Deduplicate
      const seen = new Set();
      pkgs = pkgs.filter(pkg => {
        const k = (pkg.title || '').toLowerCase().trim();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      // Fallback
      if (pkgs.length === 0) {
        pkgs = [
          { title: `${destName} Explorer Package`, provider: 'MakeMyTrip', price: '45000', currency: 'INR', duration: `${days} Days`, rating: '4.7/5', inclusions: ['Hotel', 'Breakfast', 'Sightseeing'], highlights: ['All-inclusive', 'Guided tours'], packageType: 'combo', source: 'MakeMyTrip' },
          { title: `Best of ${destName} Tour`, provider: 'Thomas Cook', price: '52000', currency: 'INR', duration: `${days} Days`, rating: '4.6/5', inclusions: ['Accommodation', 'All Meals', 'Sightseeing'], highlights: ['Luxury stays', 'Expert guides'], packageType: 'combo', source: 'Thomas Cook' },
        ];
      }

      // Stamp destination-correct booking URLs
      return pkgs.map(pkg => {
        const url = buildBookingUrl(pkg.source || pkg.provider || '', destName, intent.source, startDate, pkg.price, preferences, budgetVal);
        return { ...pkg, bookingUrl: url, url };
      });
    };

    // ── MULTI-DESTINATION: 2–3 packages per city ──────────────────────────────
    if (intent.is_multi_destination && Array.isArray(intent.sub_destinations) && intent.sub_destinations.length > 1) {
      console.log(`📦 Multi-destination packages for: ${intent.sub_destinations.join(', ')}`);
      const grouped = [];
      for (const dest of intent.sub_destinations) {
        const pkgs = await fetchPackagesForDest(dest, 3);
        grouped.push({ destination: dest, packages: pkgs });
      }
      return { packages: grouped };
    }

    // ── SINGLE DESTINATION: flat array (backward compatible) ──────────────────
    const singlePackages = await fetchPackagesForDest(destination, 5);
    return { packages: singlePackages };

  } catch (error) {
    console.error('PackageNode Error:', error);
    return { packages: [] };
  }
};

module.exports = { packageNode };
