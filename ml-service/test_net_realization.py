"""Unit tests for the deterministic net-realization calculator.

Run from ml-service/:  python -m unittest test_net_realization -v
"""
import unittest

from net_realization import NetRealizationRequest, compute_net_realization


def onion_prices():
    return [
        {"market": "Nashik", "modalPrice": 1850, "arrivalDate": "2026-09-06", "source": "agmarknet_snapshot"},
        {"market": "Pune", "modalPrice": 1950, "arrivalDate": "2026-09-06", "source": "agmarknet_snapshot"},
        {"market": "Solapur", "modalPrice": 1720, "arrivalDate": "2026-09-06", "source": "agmarknet_snapshot"},
        {"market": "Kolhapur", "modalPrice": 1780, "arrivalDate": "2026-09-06", "source": "agmarknet_snapshot"},
    ]


class NetRealizationTests(unittest.TestCase):
    def test_ranks_by_farmer_net_desc(self):
        req = NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices())
        out = compute_net_realization(req)
        nets = [m["farmerNetPerQuintal"] for m in out["rankedMandis"]]
        self.assertEqual(nets, sorted(nets, reverse=True), "must rank by farmer net, descending")
        self.assertEqual(out["rankedMandis"][0]["rank"], 1)
        self.assertEqual(out["bestMandi"], out["rankedMandis"][0]["market"])

    def test_aha_inversion_higher_headline_lower_net(self):
        """Pune quotes ₹1950 vs Nashik ₹1850, but the 210 km haul (₹1.5/q/km)
        reverses the ranking: the farmer nets more at the lower-priced local mandi."""
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices())
        )
        by_market = {m["market"]: m for m in out["rankedMandis"]}
        self.assertGreater(by_market["Pune"]["grossPricePerQuintal"], by_market["Nashik"]["grossPricePerQuintal"])
        self.assertLess(by_market["Pune"]["farmerNetPerQuintal"], by_market["Nashik"]["farmerNetPerQuintal"])
        self.assertEqual(out["bestMandi"], "Nashik")

    def test_net_equals_gross_minus_farmer_costs(self):
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices())
        )
        m = out["rankedMandis"][0]
        expected = m["grossPricePerQuintal"] - m["farmerCosts"]["totalCostsPerQuintal"]
        self.assertAlmostEqual(m["farmerNetPerQuintal"], expected, places=2)

    def test_buyer_side_charges_not_deducted(self):
        """Buyer-side APMC commission/fee must be reported but never subtracted."""
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices())
        )
        m = out["rankedMandis"][0]
        charges = out["buyerSideCharges"]
        self.assertTrue(any(not i["deductedFromFarmerNet"] for i in charges["items"]))
        # net should be >= gross - (transport + storage + other) even with buyer charges present
        self.assertAlmostEqual(
            m["farmerNetPerQuintal"],
            m["grossPricePerQuintal"] - m["farmerCosts"]["totalCostsPerQuintal"],
            places=2,
        )

    def test_quantity_scales_totals(self):
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=40, prices=onion_prices())
        )
        m = out["rankedMandis"][0]
        self.assertAlmostEqual(m["farmerNetTotal"], m["farmerNetPerQuintal"] * 40, places=2)
        self.assertEqual(out["quantityQuintals"], 40)

    def test_evidence_and_provenance_attached(self):
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices())
        )
        self.assertTrue(out["provenance"]["deterministic"])
        self.assertFalse(out["provenance"]["llmUsed"])
        ev = out["rankedMandis"][0]["evidence"]
        self.assertEqual(ev["priceSource"], "agmarknet_snapshot")
        self.assertEqual(ev["arrivalDate"], "2026-09-06")

    def test_unknown_markets_excluded_not_defaulted(self):
        """A mandi we have no distance for must be skipped (with a note), not
        ranked on a made-up default distance."""
        prices = onion_prices() + [
            {"market": "Chandrapur(Ganjwad)", "modalPrice": 9000, "arrivalDate": "2026-09-06", "source": "agmarknet_live"}
        ]
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=prices)
        )
        markets = [m["market"] for m in out["rankedMandis"]]
        self.assertNotIn("Chandrapur(Ganjwad)", markets)
        skipped = [s["market"] for s in out["skippedMarkets"]]
        self.assertIn("Chandrapur(Ganjwad)", skipped)

    def test_invalid_inputs_rejected(self):
        with self.assertRaises(ValueError):
            compute_net_realization(NetRealizationRequest(crop="Onion", district="Pune", quantity=0, prices=onion_prices()))
        with self.assertRaises(ValueError):
            compute_net_realization(NetRealizationRequest(crop="Onion", district="Pune", quantity=10, prices=[]))


if __name__ == "__main__":
    unittest.main()
