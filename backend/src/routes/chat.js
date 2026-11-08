const express = require('express');
const axios = require('axios');
const intentsConfig = require('../data/chatIntents.json');
const marketCache = require('../services/marketCache');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL || 'http://localhost:8001';
const NET_REALIZATION_URL = process.env.NET_REALIZATION_URL || 'http://localhost:8002';
const MAX_MESSAGE_LENGTH = 1000;

const ASK_SYSTEM_PROMPT = `
You are Kisan360 Assistant, a concise multilingual guide for Indian farmers.
Answer the user's exact question directly. Do not dump a generic feature list.

Kisan360 helps farmers:
- compare mandis by net realization, not just headline price
- understand farmer-borne costs such as transport, storage, loading, bagging and handling
- review selling pathways: sell now, store, pool through an FPO, or use an alternate market
- create a lot, find compatible buyers, send offers and track simulated payments
- read crop advisory and government scheme guidance

Government scheme facts:
- PM-KISAN provides Rs 6,000 per year to eligible farmer families in three Rs 2,000 installments.
- PMFBY is crop insurance for losses from notified natural calamities, pests and diseases, with farmer premiums and claim rules set by crop/season/state.
- Kisan Credit Card gives short-term crop credit and working-capital support through banks.
- Soil Health Card gives soil nutrient test results and fertilizer recommendations.
- PMKSY supports irrigation and water-use efficiency.
- eNAM links APMC mandis through an electronic trading platform.
- Agriculture Infrastructure Fund supports post-harvest infrastructure projects.
- MIDH supports horticulture development.
- NFSM supports food security crops and productivity.
- RKVY supports state agriculture development projects.

Net realization means the money the farmer is estimated to keep: mandi price minus farmer-borne costs.
Do not invent live prices, forecast future prices, guarantee income, or give financial advice.
If the farmer asks what to do, say Kisan360 can show data and options, but the decision is theirs.
If payments are mentioned, state that Kisan360 demo payments are simulated and no real money moves.
Reply in the requested language: English for en, Marathi for mr, Hindi for hi.
`.trim();

const NAVIGATION_PATHS = {
  navigate_decision: '/decision',
  navigate_net_realization: '/net-realization',
  navigate_pathways: '/pathways',
  navigate_trade: '/trade',
  navigate_weather: '/weather',
  navigate_disease: '/disease-detection',
  navigate_advisory: '/advisory',
  navigate_schemes: '/schemes',
  navigate_community: '/community',
};

const CROP_VOCAB = [
  { en: 'Onion', patterns: [/onion/i, /kanda/i, /कांदा/i, /कांदे/i, /प्याज़/i, /pyaj/i, /प्याज/i] },
  { en: 'Soyabean', patterns: [/soyabean/i, /soybean/i, /soya/i, /सोयाबीन/i, /सोया/i] },
  { en: 'Cotton', patterns: [/cotton/i, /kapas/i, /कपास/i, /kapus/i, /कापूस/i] },
  { en: 'Paddy', patterns: [/paddy/i, /rice/i, /dhan/i, /धान/i, /तांदुळ/i, /tandul/i, /चावल/i] },
  { en: 'Wheat', patterns: [/wheat/i, /gehu/i, /गेहूँ/i, /गहू/i, /gehun/i, /gahu/i] },
  { en: 'Tur', patterns: [/tur/i, /toor/i, /arhar/i, /तूर/i, /अरहर/i, /तुवर/i, /pigeon/i] },
  { en: 'Chana', patterns: [/chana/i, /chickpea/i, /चना/i, /हरभरा/i, /harbhara/i] },
  { en: 'Moong', patterns: [/moong/i, /mung/i, /green gram/i, /मूग/i, /मूंग/i] },
  { en: 'Urad', patterns: [/urad/i, /black gram/i, /उडीद/i, /उडद/i] },
  { en: 'Groundnut', patterns: [/groundnut/i, /peanut/i, /mungfali/i, /मूंगफली/i, /शेंगदाणा/i, /shenga/i] },
  { en: 'Sugarcane', patterns: [/sugarcane/i, /cane/i, /ganna/i, /गन्ना/i, /ऊस/i, /oos/i] },
  { en: 'Maize', patterns: [/maize/i, /corn/i, /makka/i, /मक्का/i, /मकै/i] },
  { en: 'Jowar', patterns: [/jowar/i, /sorghum/i, /ज्वार/i, /जोवार/i, /सोरघम/i] },
  { en: 'Bajra', patterns: [/bajra/i, /millet/i, /बाजरा/i, /बाजरी/i, /pearl millet/i] },
  { en: 'Tomato', patterns: [/tomato/i, /tamatar/i, /टमाटर/i, /टोमॅटो/i] },
  { en: 'Grape', patterns: [/grape/i, /angur/i, /अंगूर/i, /द्राक्ष/i, /draksha/i] },
  { en: 'Pomegranate', patterns: [/pomegranate/i, /anaar/i, /अनार/i, /डाळिंब/i, /dalimb/i] },
  { en: 'Banana', patterns: [/banana/i, /kela/i, /केला/i, /केळी/i, /keli/i] },
  { en: 'Potato', patterns: [/potato/i, /aalu/i, /आलू/i, /बटाटा/i, /batata/i] },
  { en: 'Chilli', patterns: [/chilli/i, /chili/i, /mirch/i, /मिर्च/i, /मिरची/i, /mirchi/i] },
];

const DISTRICT_VOCAB_MAHARASHTRA = [
  { en: 'Nashik', patterns: [/nashik/i, /nasik/i, /नाशिक/i] },
  { en: 'Ahmednagar', patterns: [/ahmednagar/i, /ahmadnagar/i, /अहमदनगर/i] },
  { en: 'Pune', patterns: [/pune/i, /पुणे/i] },
  { en: 'Solapur', patterns: [/solapur/i, /सोलापूर/i] },
  { en: 'Sangli', patterns: [/sangli/i, /सांगली/i] },
  { en: 'Satara', patterns: [/satara/i, /सातारा/i] },
  { en: 'Kolhapur', patterns: [/kolhapur/i, /कोल्हापूर/i] },
  { en: 'Aurangabad', patterns: [/aurangabad/i, /औरंगाबाद/i] },
  { en: 'Jalgaon', patterns: [/jalgaon/i, /जळगाव/i] },
  { en: 'Nanded', patterns: [/nanded/i, /नांदेड/i] },
  { en: 'Amravati', patterns: [/amravati/i, /अमरावती/i] },
  { en: 'Nagpur', patterns: [/nagpur/i, /नागपूर/i] },
  { en: 'Akola', patterns: [/akola/i, /अकोला/i] },
  { en: 'Washim', patterns: [/washim/i, /वाशिम/i] },
  { en: 'Parbhani', patterns: [/parbhani/i, /परभणी/i] },
  { en: 'Latur', patterns: [/latur/i, /लातूर/i] },
  { en: 'Osmanabad', patterns: [/osmanabad/i, /dharashiv/i, /ओस्मानाबाद/i, /धाराशिव/i] },
  { en: 'Beed', patterns: [/beed/i, /बीड/i] },
  { en: 'Ratnagiri', patterns: [/ratnagiri/i, /रत्नागिरी/i] },
  { en: 'Thane', patterns: [/thane/i, /थाणे/i] },
  { en: 'Palghar', patterns: [/palghar/i, /पालघर/i] },
  { en: 'Raigad', patterns: [/raigad/i, /रायगड/i] },
  { en: 'Mumbai', patterns: [/mumbai/i, /bombay/i, /मुंबई/i] },
];

function extractCrop(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  for (const c of CROP_VOCAB) {
    for (const p of c.patterns) {
      if (p.test(text)) return c.en;
    }
  }
  return null;
}

function extractDistrict(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  for (const d of DISTRICT_VOCAB_MAHARASHTRA) {
    for (const p of d.patterns) {
      if (p.test(text)) return d.en;
    }
  }
  return null;
}

function extractQuantity(message) {
  const text = normalizeMessage(message);
  if (!text) return null;
  const quintalMatch = text.match(/(\d+(?:\.\d+)?)\s*(quintal|quintals|q|kwintal|क्विंटल|किंटल)/i);
  if (quintalMatch) return quintalMatch[1];
  const tonneMatch = text.match(/(\d+(?:\.\d+)?)\s*(tonne|tonnes|ton|tons|टन)/i);
  if (tonneMatch) return String(Number(tonneMatch[1]) * 10);
  const kgMatch = text.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilogram|kilograms|किलो|केजी)/i);
  if (kgMatch) return String(Number(kgMatch[1]) / 100);
  const bareNumber = text.match(/(?:^|\s)(\d+(?:\.\d+)?)(?=\s|$)/);
  if (bareNumber && Number(bareNumber[1]) >= 1 && Number(bareNumber[1]) <= 1000) return bareNumber[1];
  return null;
}

function extractParams(message, context = {}) {
  const fromText = {
    crop: extractCrop(message),
    district: extractDistrict(message),
    quantity: extractQuantity(message),
  };
  return {
    crop: fromText.crop || context.crop || context.commodity || null,
    district: fromText.district || context.district || context.location || null,
    quantity: fromText.quantity || (context.quantityQuintals != null ? String(context.quantityQuintals) : null) || (context.quantity != null ? String(context.quantity) : null),
  };
}

function buildPrefillPath(basePath, params) {
  const search = new URLSearchParams();
  if (params.crop) search.set('crop', params.crop);
  if (params.district) search.set('district', params.district);
  if (params.quantity) search.set('quantity', params.quantity);
  const qs = search.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const PREFILL_NAV_HANDLERS = new Set([
  'navigate_decision',
  'navigate_net_realization',
  'navigate_trade',
]);

const SUGGESTIONS = {
  ask: {
    en: ['How does net realization work?', 'Show government schemes', 'What is PM-KISAN?', 'Explain transport costs'],
    mr: ['निव्वळ नफा कसा काम करतो?', 'सरकारी योजना दाखवा', 'PM-KISAN म्हणजे काय?', 'वाहतूक खर्च समजावा'],
    hi: ['शुद्ध लाभ कैसे काम करता है?', 'सरकारी योजनाएँ दिखाएँ', 'PM-KISAN क्या है?', 'परिवहन खर्च समझाएँ'],
  },
  action: {
    en: ['Compare mandis for onion', 'Open pathway page', 'Create a new lot', 'Go to trade desk'],
    mr: ['कांद्यासाठी बाजार तुलना करा', 'मार्ग पेज उघडा', 'नवीन लॉट तयार करा', 'व्यापार डेस्कवर जा'],
    hi: ['प्याज़ के लिए मंडियाँ तुलना करें', 'रास्ता पेज खोलें', 'नया लॉट बनाएं', 'व्यापार डेस्क पर जाएँ'],
  },
};

const TEXT = {
  en: {
    empty: 'Please ask about mandi prices, net realization, crop advice, schemes, or selling your lot.',
    fallback: "I can help with crop selling decisions, mandi comparisons, government schemes, crop health, and advisory. I do not predict prices or move real money. Ask me what you want to compare.",
    unavailable: "I don't have live advisory data right now. I can still guide you to Kisan360's calculators and market tools.",
    greeting: "Namaste! I'm Kisan360 Assistant. I can help you compare markets, understand your net realization, create lots, or find buyers. What would you like to do?",
    howItWorks: 'Kisan360 compares markets by net realization: mandi price minus farmer-borne costs like transport, storage, loading and handling. It shows data and assumptions so you can decide; it does not predict prices or give financial advice.',
    schemes: 'Useful schemes to check: PM-KISAN, PMFBY crop insurance, Kisan Credit Card, Soil Health Card, PMKSY irrigation, eNAM, Agriculture Infrastructure Fund, PM Formalisation of Micro Food Processing, MIDH horticulture support, NFSM, Rashtriya Krishi Vikas Yojana, and state subsidy portals. Eligibility changes by crop, land record, and district, so verify on the official portal before applying.',
    noLot: 'I do not have a saved lot yet. Open Decision Workspace and enter crop, district, and quantity once; then I can use that context here.',
    lotPrefix: 'Your current lot context',
    noLive: "I don't have live data right now, so I will not invent a price.",
  },
  mr: {
    empty: 'कृपया बाजार भाव, निव्वळ नफा, पीक सल्ला, योजना किंवा तुमच्या लॉटबद्दल विचारा.',
    fallback: 'मी पीक विक्री निर्णय, बाजार तुलना, सरकारी योजना, पीक आरोग्य आणि सल्ला यासाठी मदत करू शकतो. मी भावाचा अंदाज लावत नाही किंवा खरे पैसे हलवत नाही.',
    unavailable: 'सध्या थेट सल्ला डेटा उपलब्ध नाही. तरीही मी तुम्हाला Kisan360 च्या कॅल्क्युलेटर आणि बाजार साधनांकडे नेऊ शकतो.',
    greeting: 'नमस्कार! मी Kisan360 Assistant आहे. मी बाजार तुलना, निव्वळ नफा समजावणे, लॉट तयार करणे किंवा खरेदीदार शोधणे यासाठी मदत करू शकतो.',
    howItWorks: 'Kisan360 निव्वळ नफ्यानुसार बाजार तुलना करतो: बाजार भाव वजा वाहतूक, भांडार, लोडिंग आणि हाताळणीसारखे शेतकरी-बोर्न खर्च. तो डेटा दाखवतो; भावाचा अंदाज किंवा आर्थिक सल्ला देत नाही.',
    schemes: 'तपासण्यासारख्या योजना: PM-KISAN, PMFBY पीक विमा, Kisan Credit Card, Soil Health Card, PMKSY सिंचन, eNAM, Agriculture Infrastructure Fund, सूक्ष्म अन्न प्रक्रिया योजना, MIDH, NFSM, RKVY आणि राज्य अनुदान पोर्टल. पात्रता जिल्हा आणि कागदपत्रांनुसार बदलते.',
    noLot: 'अजून सेव्ह केलेला लॉट सापडला नाही. Decision Workspace मध्ये पीक, जिल्हा आणि प्रमाण एकदा भरा.',
    lotPrefix: 'तुमचा सध्याचा लॉट संदर्भ',
    noLive: 'सध्या थेट डेटा उपलब्ध नाही, त्यामुळे मी भाव तयार करणार नाही.',
  },
  hi: {
    empty: 'कृपया मंडी भाव, शुद्ध लाभ, फसल सलाह, योजनाएँ या अपने लॉट के बारे में पूछें.',
    fallback: 'मैं फसल बिक्री निर्णय, मंडी तुलना, सरकारी योजनाएँ, फसल स्वास्थ्य और सलाह में मदद कर सकता हूँ। मैं कीमतों की भविष्यवाणी नहीं करता और असली पैसे नहीं चलाता.',
    unavailable: 'अभी लाइव सलाह डेटा उपलब्ध नहीं है। फिर भी मैं आपको Kisan360 के कैलकुलेटर और बाज़ार टूल तक ले जा सकता हूँ.',
    greeting: 'नमस्ते! मैं Kisan360 Assistant हूँ। मैं मंडी तुलना, शुद्ध लाभ समझाने, लॉट बनाने या खरीददार खोजने में मदद कर सकता हूँ.',
    howItWorks: 'Kisan360 शुद्ध लाभ से मंडियों की तुलना करता है: मंडी भाव घटाकर किसान द्वारा वहन किए गए खर्च जैसे परिवहन, भंडारण, लोडिंग और हैंडलिंग। यह डेटा दिखाता है; कीमतों की भविष्यवाणी या वित्तीय सलाह नहीं देता.',
    schemes: 'देखने योग्य योजनाएँ: PM-KISAN, PMFBY फसल बीमा, Kisan Credit Card, Soil Health Card, PMKSY सिंचाई, eNAM, Agriculture Infrastructure Fund, माइक्रो फूड प्रोसेसिंग योजना, MIDH, NFSM, RKVY और राज्य सब्सिडी पोर्टल। पात्रता जिला और दस्तावेज़ों के अनुसार बदलती है.',
    noLot: 'अभी कोई सेव किया हुआ लॉट नहीं मिला। Decision Workspace में फसल, जिला और मात्रा एक बार भरें.',
    lotPrefix: 'आपका वर्तमान लॉट संदर्भ',
    noLive: 'अभी लाइव डेटा उपलब्ध नहीं है, इसलिए मैं कीमत नहीं बनाऊँगा.',
  },
};

function normalizeLanguage(language) {
  return ['en', 'mr', 'hi'].includes(language) ? language : 'en';
}

function normalizeMode(mode) {
  return mode === 'ask' ? 'ask' : 'action';
}

function suggestionsFor(language, mode) {
  return SUGGESTIONS[normalizeMode(mode)][normalizeLanguage(language)];
}

function normalizeMessage(message) {
  return String(message || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function classifyIntents(message) {
  const normalized = normalizeMessage(message);
  if (!normalized) return [{ intent: 'empty', handler: 'empty', confidence: 1, matches: [] }];

  const matches = [];
  for (const intent of intentsConfig.intents.filter((item) => item.name !== 'fallback')) {
    let keywordHits = 0;
    for (const keyword of intent.keywords || []) {
      if (normalized.includes(keyword.toLowerCase())) keywordHits += 1;
    }

    let patternHit = false;
    if (intent.pattern) {
      try {
        patternHit = new RegExp(intent.pattern, 'i').test(normalized);
      } catch {
        patternHit = false;
      }
    }

    if (keywordHits || patternHit) {
      const confidence = keywordHits * 2 + (patternHit ? 3 : 0);
      matches.push({ intent: intent.name, handler: intent.handler, confidence, keywordHits, patternHit });
    }
  }

  if (!matches.length) return [{ intent: 'fallback', handler: 'llm_fallback', confidence: 0, matches: [] }];
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}

function classifyIntent(message) {
  return classifyIntents(message)[0];
}

function contextLine(context = {}) {
  const crop = context.crop || context.commodity;
  const district = context.district || context.location;
  const quantity = context.quantityQuintals || context.quantity;
  const parts = [];
  if (crop) parts.push(crop);
  if (district) parts.push(district);
  if (quantity) parts.push(`${quantity} q`);
  return parts.join(' · ');
}

function withContext(text, context) {
  const line = contextLine(context);
  return line ? `${text} I will use your current lot: ${line}.` : text;
}

function localAskFallback(message, context, language) {
  const q = normalizeMessage(message);
  const line = contextLine(context);
  const contextSuffix = line ? ` Current lot context: ${line}.` : '';

  const answers = {
    en: {
      pmKisan: 'PM-KISAN (Pradhan Mantri Kisan Samman Nidhi) provides Rs 6,000 per year of direct income support to eligible farmer families, paid in three installments of Rs 2,000. Eligibility depends on land records and government rules, so verify your status on the PM-KISAN portal or with the local agriculture office.',
      pmfby: 'PMFBY (Pradhan Mantri Fasal Bima Yojana) is crop insurance. Farmers pay a notified premium and may receive claim support when insured crops suffer covered losses from events such as natural calamities, pests, or diseases, based on official assessment rules.',
      kcc: 'Kisan Credit Card helps farmers access short-term crop credit and working capital through banks. Loan limits, interest support, and documents depend on the bank, crop, land record, and state rules.',
      transport: 'Transport costs are the costs of moving produce from farm to mandi or buyer: vehicle hire, fuel, loading labour, distance and sometimes waiting or handling. They reduce net realization, so a mandi with a higher headline price can still leave less money in your pocket if transport is high.',
      net: 'Net realization is the estimated amount you keep after farmer-borne costs are subtracted from the mandi price. Kisan360 uses this to compare mandis, but it does not predict future prices or guarantee income.',
      compare: 'To compare mandis, look beyond the headline mandi price and subtract farmer-borne costs such as transport, storage, loading and handling. Kisan360 ranks mandis by estimated net realization so you can see which option may leave more in your pocket, without predicting future prices.',
      sell: 'To sell through Kisan360, enter your crop, district and quantity in the Decision Workspace, compare mandis by net realization, choose a pathway, create a lot in Trade, review compatible buyers, send an offer, and track the simulated payment status. Kisan360 shows the data; the final decision is yours.',
      schemes: 'Useful schemes include PM-KISAN for income support, PMFBY for crop insurance, Kisan Credit Card for crop credit, Soil Health Card for fertilizer guidance, PMKSY for irrigation, eNAM for market linkage, AIF for infrastructure, MIDH for horticulture, NFSM and RKVY. Eligibility varies by district, crop and documents.',
      fallback: TEXT.en.fallback,
    },
    mr: {
      pmKisan: 'PM-KISAN योजनेत पात्र शेतकरी कुटुंबांना दरवर्षी Rs 6,000 थेट मदत मिळते, ती Rs 2,000 च्या तीन हप्त्यांत दिली जाते. पात्रता जमीन नोंदी आणि सरकारी नियमांवर अवलंबून असते.',
      pmfby: 'PMFBY म्हणजे पीक विमा योजना. नैसर्गिक आपत्ती, कीड किंवा रोगामुळे विमा घेतलेल्या पिकाचे नुकसान झाल्यास, अधिकृत मूल्यांकन नियमांनुसार दावा मदत मिळू शकते.',
      kcc: 'Kisan Credit Card शेतकऱ्यांना बँकांमार्फत अल्पकालीन पीक कर्ज आणि कामकाजासाठी भांडवल मिळवण्यास मदत करते. मर्यादा आणि कागदपत्रे बँक, पीक, जमीन नोंद आणि राज्य नियमांवर अवलंबून असतात.',
      transport: 'वाहतूक खर्च म्हणजे शेतातून बाजार किंवा खरेदीदारापर्यंत माल नेण्याचा खर्च: वाहन भाडे, इंधन, लोडिंग मजूर, अंतर आणि कधी कधी हाताळणी. हा खर्च निव्वळ नफा कमी करतो.',
      net: 'निव्वळ नफा म्हणजे बाजार भावातून शेतकऱ्यावरचे खर्च वजा केल्यानंतर उरणारी अंदाजित रक्कम. Kisan360 बाजार तुलना याच आधारावर करतो; तो भविष्यातील भावाचा अंदाज किंवा उत्पन्नाची हमी देत नाही.',
      compare: 'बाजार तुलना करताना फक्त घोषित भाव पाहू नका; वाहतूक, भांडार, लोडिंग आणि हाताळणीसारखे शेतकऱ्यावरचे खर्च वजा करा. Kisan360 निव्वळ नफ्यानुसार बाजार क्रमवारी दाखवतो.',
      sell: 'Kisan360 वर विक्रीसाठी Decision Workspace मध्ये पीक, जिल्हा आणि प्रमाण भरा, निव्वळ नफ्यानुसार बाजार तुलना करा, मार्ग निवडा, Trade मध्ये लॉट तयार करा, खरेदीदार तपासा, ऑफर पाठवा आणि सिम्युलेटेड पेमेंट ट्रॅक करा.',
      schemes: 'उपयुक्त योजना: PM-KISAN, PMFBY पीक विमा, Kisan Credit Card, Soil Health Card, PMKSY सिंचन, eNAM, AIF, MIDH, NFSM आणि RKVY. पात्रता जिल्हा, पीक आणि कागदपत्रांनुसार बदलते.',
      fallback: TEXT.mr.fallback,
    },
    hi: {
      pmKisan: 'PM-KISAN में पात्र किसान परिवारों को हर वर्ष Rs 6,000 की सीधी सहायता मिलती है, जो Rs 2,000 की तीन किस्तों में दी जाती है। पात्रता भूमि रिकॉर्ड और सरकारी नियमों पर निर्भर करती है.',
      pmfby: 'PMFBY यानी Pradhan Mantri Fasal Bima Yojana फसल बीमा है। प्राकृतिक आपदा, कीट या रोग से बीमित फसल को नुकसान होने पर आधिकारिक आकलन नियमों के अनुसार दावा सहायता मिल सकती है.',
      kcc: 'Kisan Credit Card किसानों को बैंकों के माध्यम से अल्पकालीन फसल ऋण और कामकाजी पूंजी पाने में मदद करता है। सीमा, ब्याज सहायता और दस्तावेज़ बैंक, फसल, भूमि रिकॉर्ड और राज्य नियमों पर निर्भर करते हैं.',
      transport: 'परिवहन खर्च खेत से मंडी या खरीददार तक माल ले जाने का खर्च है: वाहन किराया, ईंधन, लोडिंग मजदूरी, दूरी और कभी-कभी हैंडलिंग। यह शुद्ध लाभ घटाता है.',
      net: 'शुद्ध लाभ वह अनुमानित राशि है जो मंडी भाव से किसान द्वारा वहन किए गए खर्च घटाने के बाद बचती है। Kisan360 इसी आधार पर मंडियों की तुलना करता है; यह भविष्य की कीमत या आय की गारंटी नहीं देता.',
      compare: 'मंडियों की तुलना करते समय सिर्फ घोषित भाव न देखें; परिवहन, भंडारण, लोडिंग और हैंडलिंग जैसे किसान-व्यय घटाएँ। Kisan360 अनुमानित शुद्ध लाभ से मंडियों को क्रमबद्ध करता है.',
      sell: 'Kisan360 पर बेचने के लिए Decision Workspace में फसल, जिला और मात्रा भरें, शुद्ध लाभ से मंडियाँ तुलना करें, रास्ता चुनें, Trade में लॉट बनाएं, उपयुक्त खरीददार देखें, ऑफर भेजें और सिमुलेटेड भुगतान ट्रैक करें.',
      schemes: 'उपयोगी योजनाएँ: PM-KISAN, PMFBY फसल बीमा, Kisan Credit Card, Soil Health Card, PMKSY सिंचाई, eNAM, AIF, MIDH, NFSM और RKVY। पात्रता जिला, फसल और दस्तावेज़ों पर निर्भर करती है.',
      fallback: TEXT.hi.fallback,
    },
  };

  const dict = answers[language] || answers.en;
  let answer = dict.fallback;
  if (/(pm[\s-]?kisan|किसान सम्मान|kisan samman)/i.test(q)) answer = dict.pmKisan;
  else if (/(pmfby|fasal bima|crop insurance|पीक विमा|फसल बीमा)/i.test(q)) answer = dict.pmfby;
  else if (/(kcc|kisan credit|credit card|कर्ज|ऋण)/i.test(q)) answer = dict.kcc;
  else if (/(transport|वाहतूक|परिवहन|truck|fuel|distance|भाडे|किराया)/i.test(q)) answer = dict.transport;
  else if (/(net realization|net realisation|शुद्ध|निव्वळ|pocket|take home)/i.test(q)) answer = dict.net;
  else if (/(compare|mandi|market|तुलना|बाजार|मंडी)/i.test(q)) answer = dict.compare;
  else if (/(how.*sell|sell my crop|create.*lot|buyer|offer|vikri|बेच|विक्री)/i.test(q)) answer = dict.sell;
  else if (/(scheme|yojana|योजना|subsidy|अनुदान)/i.test(q)) answer = dict.schemes;

  return `${answer}${contextSuffix}`;
}

async function answerLotStatus(context, language) {
  const t = TEXT[language];
  const line = contextLine(context);
  if (!line) return { text: t.noLot, suggestions: suggestionsFor(language, 'ask') };

  const crop = context.crop || context.commodity;
  const district = context.district || context.location;
  let extra = '';
  if (crop) {
    try {
      const data = await marketCache.getBestPrices({ crop, state: 'Maharashtra', limit: 50 });
      const districtRows = district ? data.rows.filter((row) => normalizeMessage(row.district) === normalizeMessage(district)) : data.rows;
      const rows = districtRows.length ? districtRows : data.rows;
      if (rows.length) {
        const best = rows.slice().sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))[0];
        extra = ` Current cached market reference: ${best.market}, ${best.district} at Rs ${best.modalPrice}/q (${data.provenance?.source || data.source}). This is an observation, not a guaranteed sale price.`;
      } else {
        extra = ` ${t.noLive}`;
      }
    } catch {
      extra = ` ${t.noLive}`;
    }
  }
  return { text: `${t.lotPrefix}: ${line}.${extra}`, suggestions: suggestionsFor(language, 'ask') };
}

// ── Agent tool: deterministic net-realization (market_prices + calculator) ──
// Fed into chat as toolResults so the answer grounds every Rs figure in the
// engine output. Never invents: if the engine is down, toolResults is absent
// and chat falls back to navigate-only (no numbers).
async function fetchNetRealizationTool(message, context) {
  const params = extractParams(message, context);
  if (!params.crop || !params.district) return null;
  const qty = params.quantity ? parseFloat(params.quantity) : 10;
  if (!Number.isFinite(qty) || qty <= 0) return null;
  try {
    const priceResult = await marketCache.getBestPrices({ crop: params.crop, state: 'Maharashtra', limit: 100 });
    if (!priceResult.rows?.length) return null;
    const deduped = priceResult.rows
      .slice()
      .sort((a, b) => (b.modalPrice || 0) - (a.modalPrice || 0))
      .filter((r, i, arr) => arr.findIndex((x) => x.market.trim().toLowerCase() === r.market.trim().toLowerCase()) === i);
    const prices = deduped.map((r) => ({
      market: r.market, variety: r.variety, minPrice: r.minPrice, maxPrice: r.maxPrice,
      modalPrice: r.modalPrice, arrivalDate: r.arrivalDate, district: r.district,
      source: priceResult.provenance?.source, retrievedAt: priceResult.provenance?.retrievedAt,
    }));
    const mlRes = await axios.post(`${NET_REALIZATION_URL}/net-realization`, {
      crop: params.crop, district: params.district, quantity: qty, prices,
    }, { timeout: 10000 });
    const engine = mlRes.data;
    if (!engine || engine.success === false || !Array.isArray(engine.rankedMandis) || !engine.rankedMandis.length) return null;
    const top = engine.rankedMandis.slice(0, 3).map((m) => ({
      market: m.market,
      farmerNetPerQuintal: m.farmerNetPerQuintal,
      farmerNetTotal: m.farmerNetTotal,
      distanceKm: m.distanceKm,
      modalPrice: m.modalPrice,
    }));
    return {
      tool: 'net_realization',
      crop: params.crop, district: params.district, quantityQuintals: qty,
      topMandis: top,
      best: top[0],
      provenance: {
        source: priceResult.source,
        retrievedAt: priceResult.provenance?.retrievedAt || null,
        freshness: priceResult.provenance?.note || priceResult.fallback ? 'cached' : 'live',
        marketSource: priceResult.source,
      },
    };
  } catch {
    return null;
  }
}

// ── Agent tool: live weather (OpenWeather) via district coords ──
// Needs OPENWEATHER_API_KEY; otherwise null (never invented).
async function fetchWeatherTool(message, context) {
  const district = extractDistrict(message) || context?.district || context?.location;
  if (!district) return null;
  if (context?.weather?.temperature != null) {
    return { tool: 'weather', district, current: context.weather, source: 'context', freshness: 'provided' };
  }
  if (!process.env.OPENWEATHER_API_KEY) return null;
  try {
    const { DISTRICTS, findDistrict } = require('../data/maharashtraDistricts');
    const d = DISTRICTS.find((x) => x.name.toLowerCase() === String(district).toLowerCase()) || findDistrict(String(district).toLowerCase());
    if (!d || !d.lat) return null;
    const res = await axios.get('https://api.openweathermap.org/data/2.5/weather', {
      params: { lat: d.lat, lon: d.lon, appid: process.env.OPENWEATHER_API_KEY, units: 'metric' },
      timeout: 5000,
    });
    const c = res.data;
    return {
      tool: 'weather', district: d.name,
      current: {
        temperature: Math.round(c.main.temp),
        humidity: c.main.humidity,
        condition: c.weather?.[0]?.main || '',
        description: c.weather?.[0]?.description || '',
      },
      source: 'openweather', retrievedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ── Agent tool: FPO pooling (deterministic via fpoPool service) ──
async function fetchFpoPoolTool(message, context) {
  const params = extractParams(message, context);
  if (!params.crop || !params.district) return null;
  try {
    const fpoPool = require('../services/fpoPool');
    const qty = params.quantity ? parseFloat(params.quantity) : 40;
    const result = await fpoPool.assessPooling?.({ crop: params.crop, district: params.district, quantity: qty })
      || await fpoPool.pool?.({ crop: params.crop, district: params.district, quantity: qty });
    if (!result) return null;
    return { tool: 'fpo_pool', crop: params.crop, district: params.district, quantity: qty, note: result.note || 'Pooled vs individual comparison' };
  } catch {
    return null;
  }
}

// ── Agent tool: schemes lookup (seed JSON, no DB required) ──
function fetchSchemesTool(message) {
  try {
    const fs = require('fs');
    const path = require('path');
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'schemes.json'), 'utf8'));
    const q = normalizeMessage(message);
    const hits = seed.filter((s) => {
      const blob = `${s.name} ${s.shortName} ${s.description} ${(s.tags || []).join(' ')}`.toLowerCase();
      return blob.split(/\s+/).some((w) => w.length > 3 && q.includes(w));
    });
    const list = (hits.length ? hits : seed.slice(0, 5)).slice(0, 5).map((s) => ({
      slug: s.slug, shortName: s.shortName, name: s.name, benefitLabel: s.benefitLabel,
    }));
    return { tool: 'schemes', count: list.length, schemes: list };
  } catch {
    return null;
  }
}

async function callGroqDirect(message, context, language) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  const systemPrompt = [
    'You are Kisan360, an AI assistant for Indian farmers.',
    'Answer concisely in 2-3 sentences.',
    'Do not invent prices or predict future prices.',
    'Do not give financial advice.',
    'Mention that payments are simulated when relevant.',
    contextLine(context) ? `Current lot context: ${contextLine(context)}.` : '',
  ].filter(Boolean).join(' ');

  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 256,
      temperature: 0.3,
    }, {
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    const answer = res.data?.choices?.[0]?.message?.content?.trim();
    if (answer) return answer;
  } catch {
    // Groq direct call failed — fall through to RAG service
  }
  return null;
}

async function answerAskMode(message, context, language) {
  // Phase 5: ask-mode is agent-backed first (RAG + weather tool), Groq second.
  // Crop advisory / disease / fertilizer / irrigation queries get grounded RAG;
  // scheme/PM-KISAN etc. stay on the precise template + schemes tool.
  try {
    const cls = classifyIntents(message);
    const topIntent = cls[0]?.intent || 'fallback';
    if (['advisory', 'crop_health', 'weather_info'].includes(topIntent)) {
      const ragText = await callRagFallback(message, context, language);
      if (ragText && ragText !== TEXT[language].fallback) return ragText;
    }
  } catch { /* fall through to Groq direct */ }

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return localAskFallback(message, context, language);

  const systemPrompt = [
    ASK_SYSTEM_PROMPT,
    `Language code: ${language}.`,
    contextLine(context) ? `Current lot context: ${contextLine(context)}.` : 'No current lot context is available.',
  ].join('\n\n');

  try {
    const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      max_tokens: 320,
      temperature: 0.2,
    }, {
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      timeout: 12000,
    });
    const answer = res.data?.choices?.[0]?.message?.content?.trim();
    if (answer) return answer;
  } catch {
    // Ask mode still needs to be useful when Groq is unavailable.
  }

  return localAskFallback(message, context, language);
}

async function callRagFallback(message, context, language) {
  const crop = context?.crop || extractCrop(message) || 'crop';
  const location = context?.district || context?.location || extractDistrict(message) || 'Maharashtra';
  let weather = context?.weather || {};
  if (weather.temperature == null) {
    const w = await fetchWeatherTool(message, context);
    if (w?.current) weather = w.current;
  }
  const query = [
    message,
    'Answer as Kisan360 for an Indian farmer.',
    'Do not invent prices, do not predict future prices, do not give financial advice, and mention that payments are simulated where relevant.',
    contextLine(context) ? `Current lot context: ${contextLine(context)}.` : '',
  ].filter(Boolean).join('\n');

  const headers = {};
  if (process.env.GROQ_API_KEY) headers['X-Groq-Key'] = process.env.GROQ_API_KEY;

  // Agentic path first (classify -> plan -> retrieve -> generate -> validate)
  // Weather-as-input: forward temp/humidity/condition so RAG tailors advice.
  try {
    const agentRes = await axios.get(`${RAG_SERVICE_URL}/agent/advisory`, {
      params: {
        query: message, crop, location,
        temperature: weather.temperature, humidity: weather.humidity, condition: weather.condition,
      },
      headers,
      timeout: 8000,
    });
    const agentData = agentRes.data || {};
    const structured = agentData.structured || agentData;
    if (structured && Array.isArray(structured.recommendations) && structured.recommendations.length) {
      return structured.recommendations.slice(0, 4).join(' ');
    }
    if (typeof structured.answer_text === 'string' && structured.answer_text.trim()) return structured.answer_text.trim();
  } catch {
    // Agent unavailable — fall through to legacy RAG
  }

  try {
    const ragRes = await axios.get(`${RAG_SERVICE_URL}/advisory`, {
      params: {
        crop, location, query,
        temperature: weather.temperature, humidity: weather.humidity, condition: weather.condition,
      },
      headers,
      timeout: 3000,
    });
    const data = ragRes.data || {};
    if (typeof data.answer === 'string' && data.answer.trim()) return data.answer.trim();
    if (typeof data.response === 'string' && data.response.trim()) return data.response.trim();
    if (Array.isArray(data.recommendations) && data.recommendations.length) {
      return data.recommendations.slice(0, 4).join(' ');
    }
  } catch {
    // RAG service unavailable — fall through to direct Groq
  }

  const directAnswer = await callGroqDirect(message, context, language);
  if (directAnswer) return directAnswer;

  return TEXT[language].fallback;
}

async function executeIntent({ message, language, context = {}, classification, mode = 'action' }) {
  const t = TEXT[language];
  const handler = classification.handler;
  const normalizedMode = normalizeMode(mode);
  const suggestions = suggestionsFor(language, normalizedMode);

  if (handler === 'empty') return { text: t.empty, suggestions };
  if (normalizedMode === 'ask') {
    const text = await answerAskMode(message, context, language);
    const weatherTool = await fetchWeatherTool(message, context);
    return {
      text,
      suggestions,
      ...(weatherTool ? { toolResults: { weather: weatherTool } } : {}),
    };
  }
  if (handler === 'respond_greeting') return { text: t.greeting, suggestions };
  if (handler === 'answer_how_it_works') return { text: t.howItWorks, suggestions };
  if (handler === 'fetch_lot_status') return answerLotStatus(context, language);

  if (handler === 'answer_schemes') {
    if (normalizedMode === 'ask') {
      const tool = fetchSchemesTool(message);
      return { text: t.schemes, suggestions, ...(tool ? { toolResults: { schemes: tool } } : {}) };
    }
    const params = extractParams(message, context);
    let schemeSlug = null;
    const q = normalizeMessage(message);
    if (/(pm[\s-]?kisan|किसान सम्मान|kisan samman)/i.test(q)) schemeSlug = 'pm-kisan';
    else if (/(nsmny|namo|नमो|महासन्मान|maha\s*nsmny)/i.test(q)) schemeSlug = 'nsmny-maharashtra';
    else if (/(pmfby|fasal bima|पीक विमा|फसल बीमा)/i.test(q)) schemeSlug = 'pm-fby';
    else if (/(kcc|kisan credit|कर्ज|ऋण)/i.test(q)) schemeSlug = 'kcc';
    else if (/(kusum|solar|सौर|सोलर)/i.test(q) && !/magel|tyala|मागे|मागेल/i.test(q)) schemeSlug = 'pm-kusum';
    else if (/(magel|tyala|मागेल|महा.*solar)/i.test(q)) schemeSlug = 'magel-tyala-solar';
    else if (/(pm[\s-]?aasha|aasha|म्स्पी|msp)/i.test(q)) schemeSlug = 'pm-aasha';
    else if (/(enam|इनाम|इ\.न\.ए\.एम|national agriculture market)/i.test(q)) schemeSlug = 'enam';
    else if (/(soil\s*health|माती\s*आरोग्य|soil card|मृदा)/i.test(q)) schemeSlug = 'soil-health-card';
    else if (/(pmksy|per drop|drip|sprinkler|सिंचन|बुंदाबुंदी)/i.test(q)) schemeSlug = 'pmksy';
    else if (/(ambedkar|आंबेडकर|dr\. babasaheb)/i.test(q)) schemeSlug = 'ambedkar-krushi';
    else if (/(maha\s*agri\s*ai|agri[\s-]?ai|महा\.?\s*ai)/i.test(q)) schemeSlug = 'maha-agri-ai';
    const path = schemeSlug ? `/schemes?slug=${encodeURIComponent(schemeSlug)}` : '/schemes';
    const schemesTool = fetchSchemesTool(message);
    return {
      text: params.crop || params.district || schemeSlug
        ? withContext(
            schemeSlug
              ? `Opening the ${schemeSlug.replace(/-/g, ' ')} scheme page for you.`
              : 'Opening the schemes list so you can browse by category.',
            context,
          )
        : withContext('Opening Government Schemes for you.', context),
      action: { type: 'navigate', path },
      suggestions,
      ...(schemesTool ? { toolResults: { schemes: schemesTool } } : {}),
    };
  }

  if (NAVIGATION_PATHS[handler]) {
    const intent = intentsConfig.intents.find((item) => item.handler === handler);
    const needsEconomics = ['navigate_decision', 'navigate_net_realization', 'navigate_pathways', 'navigate_trade'].includes(handler);
    if (normalizedMode === 'ask') {
      const econ = needsEconomics ? await fetchNetRealizationTool(message, context) : null;
      return {
        text: withContext(intent?.response || 'That section can help with this request.', context),
        suggestions,
        ...(econ ? { toolResults: { netRealization: econ } } : {}),
      };
    }
    const params = extractParams(message, context);
    // First-run onboarding: if economics intent has no crop/district yet, ask
    // in the farmer's language instead of navigating to an empty workspace.
    if (needsEconomics && (!params.crop || !params.district)) {
      const ask = {
        en: 'To compare mandis, tell me: (1) crop, (2) district, (3) quantity in quintals. Example: "Onion, Nashik, 10 quintals".',
        mr: 'बाजार तुलना करण्यासाठी सांगा: (1) पीक, (2) जिल्हा, (3) प्रमाण क्विंटलमध्ये. उदाहरण: "कांदा, नाशिक, 10 क्विंटल".',
        hi: 'मण्डियों की तुलना के लिए बताइए: (1) फसल, (2) जिला, (3) मात्रा क्विंटल में। उदाहरण: "प्याज, नाशिक, 10 क्विंटल"।',
      }[language] || 'To compare mandis, tell me your crop, district and quantity in quintals.';
      return { text: ask, suggestions };
    }
    const basePath = NAVIGATION_PATHS[handler];
    const fullPath = PREFILL_NAV_HANDLERS.has(handler) ? buildPrefillPath(basePath, params) : basePath;
    const fragments = [];
    if (params.crop) fragments.push(params.crop);
    if (params.district) fragments.push(params.district);
    if (params.quantity) fragments.push(`${params.quantity} q`);
    const prefixText = fragments.length
      ? `Opening Decision Workspace pre-filled with ${fragments.join(' · ')}…`
      : intent?.response || 'Opening that section for you.';
    // Economics tool (deterministic): include top-3 ranked mandis + provenance
    // so the frontend can render cards without a second round-trip.
    const econ = needsEconomics ? await fetchNetRealizationTool(message, context) : null;
    const fpo = handler === 'navigate_pathways' ? await fetchFpoPoolTool(message, context) : null;
    const econLine =
      econ?.best
        ? ` Best right now: ${econ.best.market} at Rs ${econ.best.farmerNetPerQuintal}/q net for ${econ.quantityQuintals} q (${econ.provenance.freshness === 'live' ? 'live' : 'cached'} AGMARKNET).`
        : '';
    return {
      text: withContext(prefixText + econLine, context),
      action: {
        type: 'navigate',
        path: fullPath,
        params: params.crop || params.district || params.quantity ? params : undefined,
      },
      suggestions,
      ...(econ ? { toolResults: { netRealization: econ, ...(fpo ? { fpo } : {}) } } : {}),
    };
  }

  try {
    return { text: await callRagFallback(message, context, language), suggestions };
  } catch {
    return { text: t.unavailable, suggestions };
  }
}

// Requires a verified token: this route spends a metered GROQ_API_KEY on
// every request, and was previously an open proxy to anyone who could reach it.
router.post('/', authenticateUser, async (req, res) => {
  try {
    const language = normalizeLanguage(req.body?.language);
    const mode = normalizeMode(req.body?.mode);
    const rawMessage = String(req.body?.message || '').slice(0, MAX_MESSAGE_LENGTH);
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const allIntents = classifyIntents(rawMessage);
    const classification = allIntents[0];
    const response = await executeIntent({ message: rawMessage, language, context, classification, mode });

    res.json({
      ...response,
      intent: classification.intent,
      intents: allIntents.map((i) => i.intent),
      allIntents,
      language,
      mode,
    });
  } catch (error) {
    console.error('Chat route error:', error.message);
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

module.exports = router;
module.exports.classifyIntent = classifyIntent;
module.exports.classifyIntents = classifyIntents;
module.exports.executeIntent = executeIntent;
module.exports.normalizeMessage = normalizeMessage;
module.exports.normalizeMode = normalizeMode;
module.exports.fetchNetRealizationTool = fetchNetRealizationTool;
module.exports.fetchSchemesTool = fetchSchemesTool;
module.exports.fetchWeatherTool = fetchWeatherTool;
module.exports.fetchFpoPoolTool = fetchFpoPoolTool;
module.exports.extractParams = extractParams;
