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

import os
import time
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
    "calculatorVersion": "1.0.0",
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
}
DEFAULT_DISTRICT = "Pune"
UNKNOWN_DISTANCE_KM = 150.0
DISTANCE_FALLBACK_NOTE = "No distance table entry for this market; using a documented default of 150 km."

app = FastAPI(title="Kisan360 Net-Realization Calculator", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def round2(value):
    return round(float(value), 2)


def norm_key(value):
    return "".join(ch for ch in str(value or "").lower() if ch.isalnum())


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
    return best


def distance_km(district, mandi):
    """Returns (km, source) where source is 'table' or 'default_150km'."""
    row = DISTANCES_KM.get((district or "").strip().title()) or DISTANCES_KM.get(district)
    if row:
        canon = find_canonical_mandi(mandi)
        if canon and row.get(canon) is not None:
            return float(row[canon]), "table"
    return UNKNOWN_DISTANCE_KM, "default_150km"


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


def compute_net_realization(req: NetRealizationRequest) -> dict:
    if req.quantity <= 0:
        raise ValueError("quantity must be > 0")
    if not req.prices:
        raise ValueError("prices must contain at least one mandi price row")

    rate_transport = ASSUMPTIONS["transport"]["ratePerQuintalPerKm"]
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
        km, distance_source = distance_km(district, mandi)

        # Only rank mandis we can actually cost. Unknown markets would need an
        # invented distance — excluded with a visible note instead.
        if distance_source != "table":
            skipped.append({
                "market": mandi,
                "grossPricePerQuintal": round2(gross),
                "reason": DISTANCE_FALLBACK_NOTE,
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
            "distanceNote": None if distance_source == "table" else DISTANCE_FALLBACK_NOTE,
            "farmerCosts": {
                "transportPerQuintal": transport_q,
                "storagePerQuintal": storage_q,
                "otherPerQuintal": other_q,
                "totalCostsPerQuintal": total_costs_q,
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

    computed.sort(key=lambda m: m["farmerNetPerQuintal"], reverse=True)
    for idx, m in enumerate(computed, start=1):
        m["rank"] = idx
        m["reason"] = _rank_reason(m, computed[0], idx)
        m["farmerNetTotal"] = round2(m["farmerNetPerQuintal"] * req.quantity)
        m["grossTotal"] = round2(m["grossPricePerQuintal"] * req.quantity)

    best = computed[0]
    return {
        "crop": req.crop,
        "district": district,
        "quantityQuintals": req.quantity,
        "unit": "₹ per quintal",
        "formula": ASSUMPTIONS["formula"],
        "bestMandi": best["market"],
        "rankedMandis": computed,
        "skippedMarkets": skipped,
        "rankingNote": "Only mandis with a documented distance estimate are ranked. Production adds routing-API distances so every APMC with a live quote can be costed.",
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
