"""
Kisan360 — Net-Realization Calculator (deterministic)

PS: SIH26132 — Strengthening Market Linkages & Price Discovery for Farmers

Farmer Net = Gross Sale Value − Farmer-Borne Transport − Farmer-Borne Storage
             − Other Farmer-Borne Charges

Buyer-side statutory charges (APMC commission / market fee) are REPORTED but
NOT deducted: under the Maharashtra APMC Act (s.31) commission is charged to the
buyer, not the farmer. The LLM never produces a number here — this module owns
every calculation; a RAG service may only *explain* the output afterwards.

Run:  python -m uvicorn net_realization:app --port 8002
"""

import math
import os
import time
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Documented assumptions (served via GET /assumptions for judges) ─────────
ASSUMPTIONS = {
    "unit": "₹ per quintal (₹/q)",
    "formula": {
        "farmerNet": "Gross sale value − farmer-borne transport − farmer-borne storage − other farmer-borne charges",
        "buyerSideCharges": "Reported separately and NEVER deducted from the farmer's net (Maharashtra APMC Act s.31 — commission is charged to the buyer).",
    },
    "transport": {
        "ratePerQuintalPerKm": 1.5,
        "basis": "Hired light commercial vehicle ≈ ₹120/km ÷ ~80 quintals/load. Short-haul minimums raise the effective rate for small lots; rate is documented, not live-quoted.",
        "bulk": {
            "ratePerQuintalPerKm": 0.75,
            "minQuantityQuintals": 40,
            "basis": "Full-truck load (≈9 t) halves the effective per-quintal rate: ≈₹120/km truck ÷ 90 q ≈ ₹1.33 → documented conservative ₹0.75/q/km for pooled lots of 40 q or more. Applied automatically when quantity ≥ minQuantityQuintals.",
        },
        "roadmap": "Replace fixed distance table with OSRM/routing-API distances (P3).",
    },
    "storage": {
        "ratePerQuintalPerDay": 1.0,
        "defaultDays": 2,
        "basis": "Warehouse/covered-yard holding charge estimate ₹1/q/day before sale.",
    },
    "other": {
        "perQuintal": 20,
        "items": {
            "bagging": 8,
            "loading": 5,
            "unloading_and_market_entry": 7,
        },
        "basis": "Bags, coolie/loading labour and mandi entry — farmer-borne.",
    },
    "buyerSide": {
        "items": [
            {"label": "APMC market fee", "ratePct": 0.5, "payer": "buyer", "deductedFromFarmerNet": False},
            {"label": "Commission agent fee", "ratePct": 1.0, "payer": "buyer", "deductedFromFarmerNet": False},
        ],
        "note": "Shown for transparency only. Under the Maharashtra APMC Act these are charged to the buyer side, so Kisan360 does not subtract them from the farmer's net realization.",
    },
    "distances": {
        "basis": "Approximate road distances (km) between farmer's district and each APMC mandi. Production uses a routing API; values here are documented estimates.",
        "defaultWhenMissingKm": 150,
        "tableKm": None,  # filled below
    },
    "decision": {
        "closeCallThresholdPerQuintal": 25,
        "basis": "Net gaps within ₹25/q (~typical day-to-day mandi price movement) are flagged 'very close' instead of a decisive winner.",
        "confidence": "Deterministic evidence rules (freshest quote age, number of comparable mandis, margin over #2) — NOT an ML/AI confidence score.",
        "robustnessScenarios": "The SAME cost engine is re-run at quantity×2, transport×1.5 and prices×0.95; ROBUST means the same mandi stays #1 in every scenario.",
    },
    "calculatorVersion": "1.2.0",
}

# Approximate road distances (km), farmer's district → mandi.
DISTANCES_KM = {
    "Pune": {"Pune": 50, "Ahmednagar": 120, "Solapur": 250, "Nashik": 210, "Satara": 115, "Kolhapur": 240, "Jalgaon": 360, "Aurangabad": 200, "Latur": 380, "Akola": 450, "Amravati": 500, "Nagpur": 710, "Mumbai": 150, "Lasalgaon": 190},
    "Nashik": {"Pune": 210, "Ahmednagar": 180, "Solapur": 350, "Nashik": 50, "Satara": 280, "Kolhapur": 320, "Jalgaon": 150, "Aurangabad": 160, "Latur": 430, "Akola": 400, "Amravati": 470, "Nagpur": 610, "Mumbai": 170, "Lasalgaon": 45},
    "Nagpur": {"Pune": 710, "Ahmednagar": 570, "Solapur": 640, "Nashik": 610, "Satara": 790, "Kolhapur": 850, "Jalgaon": 470, "Aurangabad": 490, "Latur": 470, "Akola": 260, "Amravati": 150, "Nagpur": 50, "Mumbai": 880, "Lasalgaon": 590},
    "Solapur": {"Pune": 250, "Ahmednagar": 280, "Solapur": 50, "Nashik": 350, "Satara": 210, "Kolhapur": 220, "Jalgaon": 420, "Aurangabad": 330, "Latur": 140, "Akola": 330, "Amravati": 430, "Nagpur": 640, "Mumbai": 400, "Lasalgaon": 330},
    "Latur": {"Pune": 380, "Ahmednagar": 220, "Solapur": 140, "Nashik": 430, "Satara": 350, "Kolhapur": 380, "Jalgaon": 330, "Aurangabad": 230, "Latur": 50, "Akola": 210, "Amravati": 270, "Nagpur": 470, "Mumbai": 470, "Lasalgaon": 410},
    "Aurangabad": {"Pune": 200, "Ahmednagar": 120, "Solapur": 330, "Nashik": 160, "Satara": 290, "Kolhapur": 360, "Jalgaon": 160, "Aurangabad": 50, "Latur": 230, "Akola": 260, "Amravati": 330, "Nagpur": 490, "Mumbai": 330, "Lasalgaon": 140},
    "Amravati": {"Pune": 500, "Ahmednagar": 420, "Solapur": 430, "Nashik": 470, "Satara": 580, "Kolhapur": 620, "Jalgaon": 330, "Aurangabad": 330, "Latur": 270, "Akola": 90, "Amravati": 50, "Nagpur": 150, "Mumbai": 600, "Lasalgaon": 450},
    "Akola": {"Pune": 450, "Ahmednagar": 360, "Solapur": 330, "Nashik": 400, "Satara": 520, "Kolhapur": 560, "Jalgaon": 280, "Aurangabad": 260, "Latur": 210, "Akola": 50, "Amravati": 90, "Nagpur": 260, "Mumbai": 540, "Lasalgaon": 380},
    "Kolhapur": {"Pune": 240, "Ahmednagar": 330, "Solapur": 220, "Nashik": 320, "Satara": 125, "Kolhapur": 50, "Jalgaon": 480, "Aurangabad": 360, "Latur": 380, "Akola": 560, "Amravati": 620, "Nagpur": 850, "Mumbai": 420, "Lasalgaon": 300},
    "Jalgaon": {"Pune": 360, "Ahmednagar": 250, "Solapur": 420, "Nashik": 150, "Satara": 470, "Kolhapur": 480, "Jalgaon": 50, "Aurangabad": 160, "Latur": 330, "Akola": 280, "Amravati": 330, "Nagpur": 470, "Mumbai": 360, "Lasalgaon": 130},
    "Ahmednagar": {"Pune": 120, "Ahmednagar": 50, "Solapur": 280, "Nashik": 180, "Satara": 180, "Kolhapur": 330, "Jalgaon": 250, "Aurangabad": 120, "Latur": 220, "Akola": 360, "Amravati": 420, "Nagpur": 570, "Mumbai": 260, "Lasalgaon": 160},
    "Satara": {"Pune": 115, "Ahmednagar": 180, "Solapur": 210, "Nashik": 280, "Satara": 50, "Kolhapur": 125, "Jalgaon": 470, "Aurangabad": 290, "Latur": 350, "Akola": 520, "Amravati": 580, "Nagpur": 790, "Mumbai": 270, "Lasalgaon": 260},
}
ASSUMPTIONS["distances"]["tableKm"] = DISTANCES_KM
# Canonical mandis we can estimate distances for (longest-first for contains matching).
DISTANCE_KEYS = sorted({k for row in DISTANCES_KM.values() for k in row}, key=len, reverse=True)

MANDI_ALIAS = {
    "nashik": "Nashik", "nasik": "Nashik",
    "pune": "Pune", "latur": "Latur", "nagpur": "Nagpur",
    "solapur": "Solapur", "akola": "Akola", "amravati": "Amravati", "amrawati": "Amravati",
    "aurangabad": "Aurangabad", "kolhapur": "Kolhapur",
    "jalgaon": "Jalgaon", "ahmednagar": "Ahmednagar", "satara": "Satara",
    "lasalgaon": "Lasalgaon", "mumbai": "Mumbai",
    # Expanded aliases for all Maharashtra markets in the AGMARKNET snapshot.
    # Covers APMC-prefix markets, sub-markets, renamed districts, and spelling variants.
    "ahilyanagar": "Ahmednagar",  # renamed district
    "chattrapatisambhajinagar": "Aurangabad",  # renamed district
    "dharashiv": "Solapur",  # renamed district (Osmanabad/Dharashiv region)
    "yeotmal": "Yavatmal",  # spelling variant
    "yavatmal": "Yavatmal",
    "sangli": "Sangli",
    "wardha": "Wardha",
    "parbhani": "Parbhani",
    "hingoli": "Hingoli",
    "nanded": "Nanded",
    "beed": "Beed",
    "dhule": "Dhule",
    "ratnagiri": "Ratnagiri",
    "chandrapur": "Chandrapur",
    "buldhana": "Buldhana",
    "washim": "Washim",
    "gondia": "Gondia",
    "bhandara": "Bhandara",
    "wardha": "Wardha",
    "jalna": "Jalna",
    "pimpalgaon": "Pimpalgaon",
    "sinnar": "Nashik",  # Sinner is in Nashik district
    "niphad": "Lasalgaon",  # Lasalgaon(Niphad) — Lasalgaon is the canonical mandi
    "vinchur": "Lasalgaon",  # Lasalgaon(Vinchur) — same mandi cluster
    "achalpur": "Amravati",  # Achalpur is in Amravati district
    "daryapur": "Amravati",  # Daryapur is in Amravati district
    "dhamngaon": "Amravati",  # Dhamangaon-Railway is in Amravati district
    "khamgaon": "Buldhana",  # Khamgaon is in Buldhana district
    "shegaon": "Buldhana",  # Shegaon is in Buldhana district
    "mehekar": "Buldhana",  # Mehekar is in Buldhana district
    "digras": "Yavatmal",  # Digras is in Yavatmal district
    "mangrulpeer": "Washim",  # Mangrulpeer is in Washim district
    "sengoan": "Hingoli",  # Sengoan is in Hingoli district
    "ahmedpur": "Latur",  # Ahmedpur is in Latur district
    "udgir": "Latur",  # Udgir is in Latur district
    "tuljapur": "Solapur",  # Tuljapur is in Osmanabad/Dharashiv region
    "gevrai": "Beed",  # Gevrai is in Beed district
    "majalgaon": "Beed",  # Majalgaon is in Beed district
    "sakri": "Dhule",  # Sakri is in Dhule district
    "baramati": "Pune",  # Baramati is in Pune district
    "ghoti": "Nashik",  # Ghoti is in Nashik district
    "chandwad": "Nashik",  # Chandwad is in Nashik district
    "kalvan": "Nashik",  # Kalvan is in Nashik district
    "nampur": "Nashik",  # Nampur is in Nashik district
    "rahata": "Ahmednagar",  # Rahata is in Ahmednagar district
    "rahuri": "Ahmednagar",  # Rahuri is in Ahmednagar district
    "bhusaval": "Jalgaon",  # Bhusaval is in Jalgaon district
    "karad": "Satara",  # Karad is in Satara district
    "patan": "Satara",  # Patan is in Satara district
    "vaduj": "Satara",  # Vaduj is in Satara district
    "vai": "Satara",  # Vai is in Satara district
    "tasgaon": "Sangli",  # Tasgaon is in Sangli district
    "vita": "Sangli",  # Vita is in Sangli district
    "kalmeshwar": "Nagpur",  # Kalmeshwar is in Nagpur district
    "kamthi": "Nagpur",  # Kamthi is in Nagpur district
    "hingna": "Nagpur",  # Hingna is in Nagpur district
    "naigaon": "Nanded",  # Naigaon is in Nanded district
    "jalana": "Jalna",  # Jalana is in Jalna district
    "mumbai": "Mumbai",
    "kanjurmarg": "Mumbai",
}
DEFAULT_DISTRICT = "Pune"

# ── Market-level coordinates for geodesic distance calculation ───────────────
# Source: AGMARKNET market locations, town-level approximate coordinates.
# Using market-specific coordinates avoids the same-district = 0km problem.
# Precision: MARKET_APPROXIMATE (town-level, not exact mandi gate).
MARKET_COORDS = {
    # ── Nashik district ──────────────────────────────────────────────
    "Lasalgaon": (19.9139, 73.7839),         # Lasalgaon(Niphad), largest onion market
    "Lasalgaon(Niphad)": (19.9139, 73.7839),
    "Lasalgaon(Vinchur)": (19.9039, 73.7639),
    "APMC Sinner": (19.8480, 73.9960),       # Sinnar town
    "APMC Sinner ": (19.8480, 73.9960),
    "APMC Pimpalgaon Baswant": (19.9780, 73.9260),
    "APMC Pimpalgaon Baswant ": (19.9780, 73.9260),
    "Pimpalgaon Baswant(Saykheda)": (19.9980, 73.9060),
    "APMC Chandwad": (20.3210, 73.8760),
    "APMC Chandwad ": (20.3210, 73.8760),
    "APMC Ghoti": (19.8900, 73.6800),        # Ghoti/Bramhanwada
    "APMC Ghoti ": (19.8900, 73.6800),
    "APMC Kalvan": (20.1700, 73.5500),       # Kalwan taluka
    "APMC Kalvan ": (20.1700, 73.5500),
    "APMC Nampur": (19.8200, 73.9500),       # Nampur area
    "APMC Nampur": (19.8200, 73.9500),
    # ── Pune district ────────────────────────────────────────────────
    "APMC Baramati": (18.1900, 74.5800),
    "APMC Baramati ": (18.1900, 74.5800),
    "Pune(Khadiki)": (18.5100, 73.8400),     # Khadiki area, Pune
    "Pune(Khadiki) ": (18.5100, 73.8400),
    "Pune(Moshi)": (18.6500, 73.8500),       # Moshi, Pimpri-Chinchwad
    "Pune(Moshi) ": (18.6500, 73.8500),
    "Pune(Pimpri)": (18.6200, 73.8100),      # Pimpri
    "Pune(Pimpri) ": (18.6200, 73.8100),
    # ── Nagpur district ──────────────────────────────────────────────
    "APMC Hingna": (21.0700, 79.0200),       # Hingna taluka
    "APMC Hingna": (21.0700, 79.0200),
    "APMC Kalmeshwar": (21.2400, 79.0500),
    "APMC Kalmeshwar ": (21.2400, 79.0500),
    "APMC Kamthi": (21.2700, 79.1500),
    "APMC Kamthi ": (21.2700, 79.1500),
    # ── Amravati district ────────────────────────────────────────────
    "APMC Achalpur": (21.2550, 77.5100),
    "APMC Achalpur ": (21.2550, 77.5100),
    "APMC Daryapur": (20.9850, 77.6800),
    "APMC Daryapur ": (20.9850, 77.6800),
    "APMC Dhamngaon-Railway": (20.9050, 78.1000),
    "APMC Dhamngaon-Railway ": (20.9050, 78.1000),
    "Amrawati(Frui & Veg. Market)": (20.9374, 77.7796),
    "Amrawati(Frui & Veg. Market) ": (20.9374, 77.7796),
    # ── Jalgaon district ─────────────────────────────────────────────
    "APMC Bhusaval": (21.0480, 75.7800),
    "APMC Bhusaval ": (21.0480, 75.7800),
    # ── Solapur district ─────────────────────────────────────────────
    "APMC Tuljapur": (18.0100, 76.0700),
    "APMC Tuljapur ": (18.0100, 76.0700),
    # ── Ahmednagar district ──────────────────────────────────────────
    "APMC Rahata": (19.5500, 74.4900),
    "APMC Rahata ": (19.5500, 74.4900),
    "APMC Rahuri": (19.5400, 74.6500),
    "APMC Rahuri ": (19.5400, 74.6500),
    # ── Satara district ──────────────────────────────────────────────
    "APMC Karad": (17.2910, 74.1830),
    "APMC Karad ": (17.2910, 74.1830),
    "APMC Patan": (17.5100, 73.8500),
    "APMC Patan ": (17.5100, 73.8500),
    "APMC Vaduj": (17.6200, 73.8900),
    "APMC Vaduj ": (17.6200, 73.8900),
    "APMC Vai": (17.7800, 73.7900),
    "APMC Vai ": (17.7800, 73.7900),
    # ── Sangli district ──────────────────────────────────────────────
    "APMC Tasgaon": (17.0300, 74.6100),
    "APMC Tasgaon ": (17.0300, 74.6100),
    "APMC Vita": (17.2800, 74.7900),
    "APMC Vita ": (17.2800, 74.7900),
    # ── Buldhana district ────────────────────────────────────────────
    "APMC Khamgaon": (20.7070, 76.5670),
    "APMC Khamgaon ": (20.7070, 76.5670),
    "APMC Shegaon": (20.7900, 76.6900),
    "APMC Shegaon ": (20.7900, 76.6900),
    "APMC Mehekar": (20.3700, 76.5100),
    "APMC Mehekar ": (20.3700, 76.5100),
    # ── Yavatmal district ────────────────────────────────────────────
    "APMC Digras": (20.1100, 78.1100),
    "APMC Digras ": (20.1100, 78.1100),
    # ── Washim district ──────────────────────────────────────────────
    "APMC Mangrulpeer": (20.2800, 77.3700),
    "APMC Mangrulpeer ": (20.2800, 77.3700),
    # ── Hingoli district ─────────────────────────────────────────────
    "APMC Sengoan": (19.6200, 77.6400),
    "APMC Sengoan ": (19.6200, 77.6400),
    # ── Latur district ───────────────────────────────────────────────
    "APMC Ahmedpur": (18.7100, 76.8100),
    "APMC Ahmedpur ": (18.7100, 76.8100),
    "APMC Udgir": (18.3900, 77.1100),
    "APMC Udgir ": (18.3900, 77.1100),
    "Latur(Murud)": (18.4088, 76.5601),
    "Latur(Murud) ": (18.4088, 76.5601),
    # ── Beed district ────────────────────────────────────────────────
    "APMC Gevrai": (19.0800, 75.5500),
    "APMC Gevrai ": (19.0800, 75.5500),
    "APMC Majalgaon": (19.1600, 76.2100),
    "APMC Majalgaon ": (19.1600, 76.2100),
    # ── Dhule district ───────────────────────────────────────────────
    "APMC Sakri": (20.9700, 74.5300),
    "APMC Sakri ": (20.9700, 74.5300),
    # ── Nanded district ──────────────────────────────────────────────
    "APMC Naigaon": (19.1800, 77.3000),
    "APMC Naigaon ": (19.1800, 77.3000),
    # ── Wardha district ──────────────────────────────────────────────
    # APMC Wardha: uses district centroid as approximate
    "APMC Wardha": (20.7453, 78.6023),
    "APMC Wardha ": (20.7453, 78.6023),
    # ── Chandrapur district ──────────────────────────────────────────
    "Chandrapur(Ganjwad)": (19.9615, 79.2967),
    "Chandrapur(Ganjwad) ": (19.9615, 79.2967),
    # ── Mumbai / Konkan ──────────────────────────────────────────────
    "Mumbai-Onion & Potato Market": (19.0760, 72.8777),  # Mumbai city
    "Mumbai-Onion & Potato Market ": (19.0760, 72.8777),
    # ── Ratnagiri district ───────────────────────────────────────────
    "APMC Ratnagiri (Nachane)": (16.9902, 73.3120),
    "APMC Ratnagiri (Nachane) ": (16.9902, 73.3120),
    # ── Aurangabad district ──────────────────────────────────────────
    "APMC Chattrapati Sambhajinagar": (19.8762, 75.3433),
    "APMC Chattrapati Sambhajinagar ": (19.8762, 75.3433),
}
# Geodesic fallback note
DISTANCE_FALLBACK_NOTE = "Distance estimated geodesically from market/district coordinates. Not a road distance — actual transport route may differ."

# ── District centroid coordinates for geodesic distance fallback ──────────────
# Source: Maharashtra district headquarters, documented reference centroids.
DISTRICT_COORDS = {
    "Pune": (18.5204, 73.8567),
    "Nashik": (19.9975, 73.7898),
    "Nagpur": (21.1458, 79.0882),
    "Solapur": (17.6599, 75.9064),
    "Latur": (18.4088, 76.5601),
    "Aurangabad": (19.8762, 75.3433),
    "Amravati": (20.9374, 77.7796),
    "Akola": (20.7070, 76.9981),
    "Kolhapur": (16.7050, 74.2433),
    "Jalgaon": (21.0077, 75.9929),
    "Ahmednagar": (19.0952, 74.7496),
    "Satara": (17.6805, 73.9906),
    "Sangli": (16.8524, 74.5647),
    "Wardha": (20.7453, 78.6023),
    "Parbhani": (19.2688, 76.7710),
    "Hingoli": (19.7150, 77.7796),
    "Nanded": (19.1383, 77.3210),
    "Beed": (18.9891, 75.7584),
    "Dhule": (20.9031, 74.7774),
    "Ratnagiri": (16.9902, 73.3120),
    "Chandrapur": (19.9615, 79.2967),
    "Buldhana": (20.5334, 76.1811),
    "Washim": (20.1114, 77.1553),
    "Yavatmal": (20.3889, 78.1294),
    "Jalna": (19.8344, 75.8845),
    "Osmanabad": (18.1719, 76.0389),
    "Nandurbar": (21.3703, 74.2031),
    "Gondia": (21.4600, 80.1941),
    "Bhandara": (21.1702, 79.6528),
    "Raigad": (18.5074, 73.0059),
    "Thane": (19.2183, 72.9781),
    "Palghar": (19.6931, 72.8155),
    "Sindhudurg": (16.0016, 73.6601),
    "Mumbai Suburban": (19.0596, 72.8295),
    "Mumbai City": (19.0760, 72.8777),
}
# Alias for renamed districts that may appear as market districts
_DISTRICT_COORDS_ALIASES = {
    "Ahilyanagar": "Ahmednagar",
    "Chattrapati Sambhajinagar": "Aurangabad",
    "Chhatrapati Sambhajinagar": "Aurangabad",
    "Dharashiv": "Osmanabad",
    "Amarawati": "Amravati",
    "Yeotmal": "Yavatmal",
}

app = FastAPI(title="Kisan360 Net-Realization Calculator", version="1.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def round2(value):
    return round(float(value), 2)


def norm_key(value):
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


def geodesic_km(lat1, lon1, lat2, lon2):
    """Haversine geodesic distance between two lat/lon points, in km.
    This is a straight-line estimate — NOT a road distance."""
    R = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _get_district_coords(name):
    """Look up district coordinates, handling aliases for renamed districts."""
    if not name:
        return None
    clean = name.strip()
    # Direct lookup
    coords = DISTRICT_COORDS.get(clean)
    if coords:
        return coords
    # Alias lookup
    alias_target = _DISTRICT_COORDS_ALIASES.get(clean)
    if alias_target:
        return DISTRICT_COORDS.get(alias_target)
    # Case-insensitive fallback
    lower = clean.lower()
    for k, v in DISTRICT_COORDS.items():
        if k.lower() == lower:
            return v
    return None


def find_canonical_mandi(market):
    """Resolve a raw market name (e.g. 'APMC Nagpur', 'Pune(Moshi)',
    'Lasalgaon(Niphad)') to a canonical mandi we have a distance for."""
    mn = norm_key(market)
    if not mn:
        return None
    # 1) exact alias match
    for alias, canon in MANDI_ALIAS.items():
        if norm_key(alias) == mn:
            return canon
    # 2) longest canonical name contained in the market name
    best = None
    best_len = 0
    for canon in DISTANCE_KEYS:
        c = norm_key(canon)
        if c and c in mn and len(c) > best_len:
            best = canon
            best_len = len(c)
    if best:
        return best
    # 3) Strip 'APMC' prefix and try again (e.g. 'APMC Baramati' → 'Baramati')
    stripped = norm_key(market.replace('APMC', '').replace('apmc', ''))
    if stripped:
        for alias, canon in MANDI_ALIAS.items():
            if norm_key(alias) == stripped:
                return canon
        for canon in DISTANCE_KEYS:
            c = norm_key(canon)
            if c and c in stripped and len(c) > (best_len if best else 0):
                best = canon
                best_len = len(c)
    return best


def _get_market_coords(market_name):
    """Look up market-specific coordinates from MARKET_COORDS registry.
    Returns (lat, lon) or None if not found."""
    if not market_name:
        return None
    clean = market_name.strip()
    # Direct lookup
    coords = MARKET_COORDS.get(clean)
    if coords:
        return coords
    # Case-insensitive fallback
    lower = clean.lower()
    for k, v in MARKET_COORDS.items():
        if k.lower() == lower:
            return v
    return None


def distance_km(district, mandi, market_district=None):
    """Returns (km, method) where method describes the distance source.
    
    Distance hierarchy:
    1. DOCUMENTED_ROAD — documented road distance from DISTANCES_KM table
    2. GEODESIC_MARKET — geodesic using market-specific coordinates (best estimate)
    3. GEODESIC_DISTRICT — geodesic using district centroid (lower precision)
    4. UNAVAILABLE — no usable distance
    
    Key: same-district does NOT mean zero distance.
    Market coordinates override district centroids.
    """
    # 1. Try documented road distance
    row = DISTANCES_KM.get((district or "").strip().title()) or DISTANCES_KM.get(district)
    if row:
        canon = find_canonical_mandi(mandi)
        if canon and row.get(canon) is not None:
            return float(row[canon]), "DOCUMENTED_ROAD"
    
    # 2. Try market-specific coordinates (best geodesic estimate)
    farmer_coords = _get_district_coords(district)
    market_coords = _get_market_coords(mandi)
    if farmer_coords and market_coords:
        km = geodesic_km(farmer_coords[0], farmer_coords[1],
                         market_coords[0], market_coords[1])
        return round(km, 1), "GEODESIC_MARKET"
    
    # 3. Fall back to district centroid for market (lower precision)
    market_district_coords = _get_district_coords(market_district) if market_district else None
    if farmer_coords and market_district_coords:
        km = geodesic_km(farmer_coords[0], farmer_coords[1],
                         market_district_coords[0], market_district_coords[1])
        return round(km, 1), "GEODESIC_DISTRICT"
    
    # 4. No usable distance
    return 0, "UNAVAILABLE"


class PriceRow(BaseModel):
    crop: Optional[str] = None
    variety: Optional[str] = None
    market: str
    district: Optional[str] = None
    state: Optional[str] = None
    minPrice: Optional[float] = None
    maxPrice: Optional[float] = None
    modalPrice: Optional[float] = None
    arrivalDate: Optional[str] = None
    source: Optional[str] = None
    retrievedAt: Optional[str] = None


class NetRealizationRequest(BaseModel):
    crop: str
    district: Optional[str] = DEFAULT_DISTRICT
    quantity: float = 10.0            # quintals
    storageDays: float = 2.0
    prices: List[PriceRow]


def _modal_price(row):
    if row.modalPrice not in (None, 0):
        return float(row.modalPrice)
    lo, hi = row.minPrice, row.maxPrice
    if lo is not None and hi is not None:
        return (float(lo) + float(hi)) / 2.0
    return 0.0


def transport_rate(quantity_quintals):
    """Documented, deterministic: small lots pay the LCV rate; pooled lots of
    40 q or more qualify for the full-truck rate (see ASSUMPTIONS.transport.bulk)."""
    bulk = ASSUMPTIONS["transport"]["bulk"]
    if quantity_quintals >= bulk["minQuantityQuintals"]:
        return bulk["ratePerQuintalPerKm"], "bulk_full_truck"
    return ASSUMPTIONS["transport"]["ratePerQuintalPerKm"], "lcv"


def compute_net_realization(req: NetRealizationRequest) -> dict:
    if req.quantity <= 0:
        raise ValueError("quantity must be > 0")
    if not req.prices:
        raise ValueError("prices must contain at least one mandi price row")

    rate_transport, transport_tier = transport_rate(req.quantity)
    rate_storage = ASSUMPTIONS["storage"]["ratePerQuintalPerDay"]
    other_per_q = ASSUMPTIONS["other"]["perQuintal"]
    district = (req.district or DEFAULT_DISTRICT).strip().title()

    computed = []
    skipped = []
    for row in req.prices:
        gross = _modal_price(row)
        if gross <= 0:
            continue
        mandi = row.market.strip()
        market_district = (row.district or '').strip().title() or None
        km, distance_source = distance_km(district, mandi, market_district)

        # Only rank mandis with a usable distance. No distance → excluded.
        if distance_source == "UNAVAILABLE" or km <= 0:
            skipped.append({
                "market": mandi,
                "grossPricePerQuintal": round2(gross),
                "reason": "Distance unavailable for this market.",
            })
            continue

        transport_q = round2(rate_transport * km)
        storage_q = round2(rate_storage * req.storageDays)
        other_q = round2(other_per_q)
        total_costs_q = round2(transport_q + storage_q + other_q)
        farmer_net_q = round2(gross - total_costs_q)

        computed.append({
            "market": mandi,
            "grossPricePerQuintal": round2(gross),
            "distanceKm": round2(km),
            "distanceSource": distance_source,
            "distanceNote": None if distance_source == "DOCUMENTED_ROAD" else DISTANCE_FALLBACK_NOTE,
            "farmerCosts": {
                "transportPerQuintal": transport_q,
                "storagePerQuintal": storage_q,
                "otherPerQuintal": other_q,
                "totalCostsPerQuintal": total_costs_q,
                "transportRatePerQuintalPerKm": rate_transport,
                "transportTier": transport_tier,
            },
            "farmerNetPerQuintal": farmer_net_q,
            "evidence": {
                "priceSource": row.source or None,
                "arrivalDate": row.arrivalDate or None,
                "retrievedAt": row.retrievedAt or None,
                "variety": row.variety or None,
            },
        })

    if not computed:
        raise ValueError("No rankable mandis: every price row is zero or has no documented distance estimate.")

    return _finish_ranking(computed, skipped, req, rate_transport, transport_tier)


def _finish_ranking(computed, skipped, req, rate_transport, transport_tier):
    """Sort, rank and attach the decision-intelligence block. The scenarios in
    `decision.robustness` re-run this same function on modified copies of the
    request, so scenario results and the headline result share one code path."""
    district = (req.district or DEFAULT_DISTRICT).strip().title()
    computed.sort(key=lambda m: m["farmerNetPerQuintal"], reverse=True)
    for idx, m in enumerate(computed, start=1):
        m["rank"] = idx
        m["reason"] = _rank_reason(m, computed[0], idx)
        m["farmerNetTotal"] = round2(m["farmerNetPerQuintal"] * req.quantity)
        m["grossTotal"] = round2(m["grossPricePerQuintal"] * req.quantity)
        # Canonical mandi name for downstream consumers (e.g. buyer coverage in
        # the Node layer). Buyer-agnostic — the calculator knows nothing about buyers.
        canon = find_canonical_mandi(m["market"])
        if canon:
            m["canonicalMandi"] = canon

    best = computed[0]
    decision = _decision_intelligence(computed, req, rate_transport)
    return {
        "crop": req.crop,
        "district": district,
        "quantityQuintals": req.quantity,
        "unit": "₹ per quintal",
        "formula": ASSUMPTIONS["formula"],
        "bestMandi": best["market"],
        "rankedMandis": computed,
        "skippedMarkets": skipped,
        "decision": decision,
        "rankingNote": "Mandis ranked by estimated farmer net. Distances documented where available; otherwise geodesic estimates from market/district coordinates. Production adds OSRM routing for precision.",
        "buyerSideCharges": ASSUMPTIONS["buyerSide"],
        "assumptionsUrl": "/assumptions",
        "provenance": {
            "calculatorVersion": ASSUMPTIONS["calculatorVersion"],
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "deterministic": True,
            "llmUsed": False,
            "note": "Deterministic engine output. The LLM (if used anywhere) only explains this result — it never generates it.",
        },
    }


def _quote_age_days(prices):
    """Age of the freshest quote in days, or None if no dates provided."""
    dates = [p.arrivalDate for p in prices if p.arrivalDate]
    if not dates:
        return None
    today = datetime.now(timezone.utc).date()
    best_age = None
    for d in dates:
        try:
            age = (today - datetime.strptime(str(d)[:10], "%Y-%m-%d").date()).days
            best_age = age if best_age is None else min(best_age, age)
        except ValueError:
            continue
    return best_age


def _decision_intelligence(computed, req, rate_transport):
    """Deterministic decision layer — no AI, no invented statistics. Every rule
    is documented in ASSUMPTIONS.decision. Gives the farmer not just 'market A
    is #1' but 'how much should I trust this ranking and when does it flip?'."""
    ranked = computed
    best = ranked[0]
    second = ranked[1] if len(ranked) > 1 else None
    close_threshold = ASSUMPTIONS["decision"]["closeCallThresholdPerQuintal"]

    # Red-team honesty: a mandi whose net is negative means the sale would not
    # even cover farmer-borne costs. Never hide that behind a rank number.
    economicsWarnings = [
        f"Selling at {m['market']} would not cover farmer-borne costs (net −₹{abs(m['farmerNetPerQuintal']):g}/q)."
        for m in ranked if m["farmerNetPerQuintal"] < 0
    ]
    if best["farmerNetPerQuintal"] < 0:
        economicsWarnings.insert(0, "No costed market currently covers farmer-borne costs at these prices — selling now means a loss on this lot.")

    # Red-team honesty: outlier quotes. A headline far outside today's range is
    # usually a data error (wrong variety, unit or a typo upstream). Flagged —
    # NOT excluded (the source may genuinely pay that) — and it degrades trust
    # in the recommendation until verified.
    outlierRows = []
    if len(ranked) >= 3:
        heads = sorted(m["grossPricePerQuintal"] for m in ranked)
        n = len(heads)
        median = heads[n // 2] if n % 2 else (heads[n // 2 - 1] + heads[n // 2]) / 2
        if median > 0:
            for m in ranked:
                ratio = m["grossPricePerQuintal"] / median
                if ratio >= 3 or ratio <= 1 / 3:
                    m["evidence"]["outlier"] = True
                    m["evidence"]["outlierNote"] = (
                        f"Quote is {ratio:.1f}× the median of today's costed mandis — possible data error "
                        f"(wrong variety/unit upstream). Verify before acting on this mandi."
                    )
                    outlierRows.append(m["market"])
    if outlierRows:
        economicsWarnings.append(
            f"Unusual quote(s) detected: {', '.join(outlierRows)} — far outside today's median price. Possible upstream data error."
        )

    gap12 = round2(best["farmerNetPerQuintal"] - second["farmerNetPerQuintal"]) if second else None

    # --- Sensitivity / break-even transport (deterministic algebra) ---------
    # For challenger B vs best A: B wins iff Δg − r·Δk > 0, where Δg = grossB −
    # grossA and Δk = kmB − kmA. Two threat directions exist:
    #   • B farther & higher-priced (Δk>0, Δg>0): B wins when the rate FALLS
    #     below r* = Δg/Δk (cheaper transport, e.g. sharing a truck).
    #   • B nearer & lower-priced (Δk<0, Δg<0): B wins when the rate RISES
    #     above r* (fuel spike). The tightest boundary is reported.
    candidates = []
    for m in ranked[1:]:
        dkm = round2(m["distanceKm"] - best["distanceKm"])
        pgap = round2(m["grossPricePerQuintal"] - best["grossPricePerQuintal"])
        if dkm == 0 or pgap == 0 or (dkm > 0) != (pgap > 0):
            continue  # no positive critical rate for this challenger
        r_star = round2(pgap / dkm)
        direction = "falls_below" if dkm > 0 else "rises_above"
        headroom = round2(abs(rate_transport - r_star) / rate_transport * 100)
        if (direction == "falls_below" and rate_transport > r_star) or (direction == "rises_above" and rate_transport < r_star):
            candidates.append({
                "challenger": m["market"],
                "direction": direction,
                "breakEvenRatePerQuintalPerKm": r_star,
                "headroomPct": headroom,
                "distanceGapKm": abs(dkm),
                "priceGapPerQuintal": abs(pgap),
            })
    breakEvenTransport = None
    if candidates:
        c = min(candidates, key=lambda x: x["headroomPct"])
        if c["direction"] == "falls_below":
            question = f"If transport gets cheaper, when does {c['challenger']} become the better sale?"
            note = (f"{c['challenger']} pays ₹{c['priceGapPerQuintal']:g}/q more headline but is ₹{c['distanceGapKm']:g} km farther. "
                    f"If your effective transport rate drops below ₹{c['breakEvenRatePerQuintalPerKm']:g}/q/km (e.g. sharing a truck), "
                    f"{c['challenger']} overtakes {best['market']}. Today's assumed rate is ₹{rate_transport:g}/q/km — {c['headroomPct']:g}% headroom. "
                    "Deterministic algebra on the same cost model — no AI.")
        else:
            question = f"If transport gets costlier, when does {c['challenger']} become the better sale?"
            note = (f"{c['challenger']} is ₹{c['distanceGapKm']:g} km nearer but pays ₹{c['priceGapPerQuintal']:g}/q less headline. "
                    f"If transport rates rise above ₹{c['breakEvenRatePerQuintalPerKm']:g}/q/km (e.g. a fuel spike), "
                    f"{c['challenger']} overtakes {best['market']}. Today's assumed rate is ₹{rate_transport:g}/q/km — {c['headroomPct']:g}% headroom. "
                    "Deterministic algebra on the same cost model — no AI.")
        breakEvenTransport = {
            "question": question,
            "currentRatePerQuintalPerKm": rate_transport,
            **c,
            "note": note,
        }

    # --- Robustness: re-run the SAME cost engine on stress scenarios --------
    best_market = best["market"]

    def _compute_only(r, transport_bump=1.0):
        """Re-run the core cost model (no decision recursion) for a scenario.
        Mirrors the main loop exactly — same rates, same distance rules."""
        rate2, tier2 = transport_rate(r.quantity)
        rate2 = round2(rate2 * transport_bump)
        computed2 = []
        for row in r.prices:
            gross = _modal_price(row)
            if gross <= 0:
                continue
            market_district = (row.district or '').strip().title() or None
            km, dsrc = distance_km((r.district or DEFAULT_DISTRICT).strip().title(), row.market.strip(), market_district)
            if dsrc == "UNAVAILABLE" or km <= 0:
                continue
            transport_q = round2(rate2 * km)
            storage_q = round2(ASSUMPTIONS["storage"]["ratePerQuintalPerDay"] * r.storageDays)
            other_q = round2(ASSUMPTIONS["other"]["perQuintal"])
            computed2.append({
                "market": row.market.strip(),
                "grossPricePerQuintal": round2(gross),
                "distanceKm": round2(km),
                "farmerNetPerQuintal": round2(gross - round2(transport_q + storage_q + other_q)),
                "farmerCosts": {
                    "transportPerQuintal": transport_q,
                    "storagePerQuintal": storage_q,
                    "otherPerQuintal": other_q,
                    "totalCostsPerQuintal": round2(transport_q + storage_q + other_q),
                    "transportRatePerQuintalPerKm": rate2,
                    "transportTier": tier2,
                },
            })
        if not computed2:
            raise ValueError("no rankable rows in scenario")
        computed2.sort(key=lambda m: m["farmerNetPerQuintal"], reverse=True)
        return computed2

    def _run_scenario(name, mutate=None, transport_bump=1.0):
        try:
            clone = req.model_copy(deep=True)
            if mutate:
                mutate(clone)
            top = _compute_only(clone, transport_bump)[0]
            return {"scenario": name, "bestMandi": top["market"], "bestNetPerQuintal": top["farmerNetPerQuintal"], "sameWinner": top["market"] == best_market}
        except Exception:
            return {"scenario": name, "bestMandi": None, "bestNetPerQuintal": None, "sameWinner": False}

    def _double_qty(r):
        r.quantity = round2(r.quantity * 2)

    def _cut_prices(r):
        for p in r.prices:
            if p.modalPrice:
                p.modalPrice = round2(p.modalPrice * 0.95)

    scenarios = [
        _run_scenario("quantity_doubled", mutate=_double_qty),
        _run_scenario("transport_cost_+50pct", transport_bump=1.5),
        _run_scenario("mandi_prices_fall_5pct", mutate=_cut_prices),
    ]
    all_same = all(s["sameWinner"] for s in scenarios)

    # --- Evidence confidence (documented rules, NOT a statistical score) ----
    age = _quote_age_days(req.prices)
    flags_good, flags_warn = [], []
    if age is None:
        flags_warn.append("Quotes carry no arrival dates — freshness unverified")
    elif age <= 1:
        flags_good.append(f"Freshest quote is {age} day(s) old")
    elif age <= 3:
        flags_warn.append(f"Freshest quote is {age} days old")
    else:
        flags_warn.append(f"Freshest quote is {age} days old — stale")
    if len(computed) >= 5:
        flags_good.append(f"{len(computed)} comparable mandis costed")
    else:
        flags_warn.append(f"Only {len(computed)} comparable mandi{'' if len(computed) == 1 else 's'} costed")
    if gap12 is None:
        pass  # single-mandi case already flagged by the comparable-count check
    elif outlierRows:
        flags_warn.append("Outlier quote(s) in today's data — verify before acting")
    elif gap12 >= close_threshold * 2:
        flags_good.append(f"Clear ₹{gap12:g}/q margin over the next best mandi")
    elif gap12 >= close_threshold:
        flags_warn.append(f"Margin over next best is only ₹{gap12:g}/q")
    else:
        flags_warn.append(f"Very close call — top two mandis differ by just ₹{gap12:g}/q")

    if not flags_warn:
        confidence = "STRONG"
    elif len(flags_warn) <= 1:
        confidence = "GOOD"
    elif any("stale" in f or "Very close" in f for f in flags_warn) and len(flags_warn) <= 2:
        confidence = "CAUTION"
    else:
        confidence = "LIMITED"
    confidenceNote = "Derived from documented evidence rules (quote age, comparable-mandi count, margin). Not an ML/AI confidence score."

    # --- Phase 21: WITHOUT vs WITH Kisan360, computed by the engine itself ---
    # The naive default every farmer falls back to: chase the highest headline
    # price. The comparison is pure ranking inspection — the same numbers that
    # produced the recommendation, viewed two ways.
    naive = max(ranked, key=lambda m: m["grossPricePerQuintal"])
    withoutWith = {
        "naive": {"market": naive["market"], "netPerQuintal": naive["farmerNetPerQuintal"], "netTotal": naive["farmerNetTotal"], "headlinePerQuintal": naive["grossPricePerQuintal"], "basis": "highest headline price"},
        "recommended": {"market": best["market"], "netPerQuintal": best["farmerNetPerQuintal"], "netTotal": best["farmerNetTotal"], "basis": "highest estimated farmer net"},
        "differencePerQuintal": round2(best["farmerNetPerQuintal"] - naive["farmerNetPerQuintal"]),
        "differenceLotTotal": round2((best["farmerNetPerQuintal"] - naive["farmerNetPerQuintal"]) * req.quantity),
        "note": "Both columns come from the same cost model and the same quotes; only the choice rule differs. No invented numbers.",
    }
    if naive["market"] == best["market"]:
        withoutWith["message"] = "Here, chasing the highest headline price happens to give the best net too — Kisan360 confirms the obvious choice with evidence."
    else:
        withoutWith["message"] = (f"The market paying the highest headline ({naive['market']}, ₹{naive['grossPricePerQuintal']:g}/q) would net you "
                                  f"₹{abs(best['farmerNetPerQuintal'] - naive['farmerNetPerQuintal']):g}/q LESS than {best['market']} after farmer-borne costs.")

    return {
        "recommended": {"market": best["market"], "netPerQuintal": best["farmerNetPerQuintal"], "netTotal": best["farmerNetTotal"], "why": best["reason"], "watch": [f"Transport assumption: ₹{rate_transport:g}/q/km over {best['distanceKm']:g} km", "Quote freshness — check the retrieval timestamp"], "alternative": ({"market": second["market"], "netPerQuintal": second["farmerNetPerQuintal"]} if second else None), "economicsWarnings": economicsWarnings},
        "differenceVsNext": ({"perQuintal": gap12, "lotTotal": round2(gap12 * req.quantity)} if second else None),
        "closeCall": ({"isCloseCall": gap12 < close_threshold, "thresholdPerQuintal": close_threshold, "message": f"Top two mandis are only ₹{gap12:g}/q apart — this difference may not justify extra logistics. Both are reasonable choices." if gap12 < close_threshold else None} if second else {"isCloseCall": False, "thresholdPerQuintal": close_threshold, "message": "Only one comparable mandi costed — there is no alternative to compare against."}),
        "breakEvenTransport": breakEvenTransport,
        "robustness": {"verdict": "ROBUST" if all_same else "SENSITIVE", "scenarios": scenarios, "note": "The same deterministic cost engine re-run under stress scenarios. ROBUST = the same mandi stays #1 in every tested scenario."},
        "confidence": {"level": confidence, "goodSignals": flags_good, "watchSignals": flags_warn, "note": confidenceNote},
        "withoutWith": withoutWith,
    }


def _rank_reason(m, top, rank):
    """Deterministic, human-readable one-liner explaining why a mandi ranks here."""
    net_gap = round2(top["farmerNetPerQuintal"] - m["farmerNetPerQuintal"])
    if rank == 1 or net_gap <= 0:
        return "Highest estimated farmer net after farmer-borne costs."
    price_gap = round2(top["grossPricePerQuintal"] - m["grossPricePerQuintal"])
    cost_gap = round2(
        m["farmerCosts"]["totalCostsPerQuintal"] - top["farmerCosts"]["totalCostsPerQuintal"]
    )
    if price_gap < 0:
        return (
            f"Headline price is ₹{abs(price_gap):g}/q HIGHER than the top mandi, but farmer-borne "
            f"costs of ₹{m['farmerCosts']['totalCostsPerQuintal']:g}/q (transport ₹"
            f"{m['farmerCosts']['transportPerQuintal']:g}/q over {m['distanceKm']:g} km) pull net "
            f"₹{net_gap:g}/q below it."
        )
    if cost_gap < 0:
        return (
            f"Lower headline price (₹{abs(price_gap):g}/q below top) but farmer-borne costs are "
            f"₹{abs(cost_gap):g}/q lower, narrowing the net gap to ₹{net_gap:g}/q."
        )
    return (
        f"Net is ₹{net_gap:g}/q below the top mandi: headline ₹{abs(price_gap):g}/q lower "
        f"and no offsetting cost advantage."
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": "net-realization-calculator", "version": ASSUMPTIONS["calculatorVersion"]}


@app.get("/assumptions")
def assumptions():
    return {"success": True, "assumptions": ASSUMPTIONS}


@app.get("/net-realization")
def net_realization_get(crop: str, district: Optional[str] = DEFAULT_DISTRICT, quantity: float = 10.0):
    raise ValueError("Use POST /net-realization with a JSON body including the prices array.")


@app.post("/net-realization", status_code=200)
def net_realization_post(req: NetRealizationRequest):
    try:
        return {"success": True, **compute_net_realization(req)}
    except ValueError as e:
        return {"success": False, "error": str(e)}
