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
            {"market": "TotallyUnknownMarket", "modalPrice": 9000, "arrivalDate": "2026-09-06", "source": "agmarknet_live"}
        ]
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=prices)
        )
        markets = [m["market"] for m in out["rankedMandis"]]
        self.assertNotIn("TotallyUnknownMarket", markets)
        skipped = [s["market"] for s in out["skippedMarkets"]]
        self.assertIn("TotallyUnknownMarket", skipped)

    def test_invalid_inputs_rejected(self):
        with self.assertRaises(ValueError):
            compute_net_realization(NetRealizationRequest(crop="Onion", district="Pune", quantity=0, prices=onion_prices()))
        with self.assertRaises(ValueError):
            compute_net_realization(NetRealizationRequest(crop="Onion", district="Pune", quantity=10, prices=[]))


class DecisionIntelligenceTests(unittest.TestCase):
    """The deterministic decision layer: confidence, close-call, break-even,
    robustness scenarios. Every assertion maps to a documented rule."""

    def test_decision_block_present_and_shape(self):
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        d = out["decision"]
        for key in ("recommended", "differenceVsNext", "closeCall", "breakEvenTransport", "robustness", "confidence"):
            self.assertIn(key, d)
        self.assertEqual(d["recommended"]["market"], out["bestMandi"])
        self.assertEqual(d["recommended"]["alternative"]["market"], out["rankedMandis"][1]["market"])

    def test_difference_vs_next_matches_ranking(self):
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        ranked = out["rankedMandis"]
        expected = round(ranked[0]["farmerNetPerQuintal"] - ranked[1]["farmerNetPerQuintal"], 2)
        self.assertAlmostEqual(out["decision"]["differenceVsNext"]["perQuintal"], expected, places=2)
        self.assertAlmostEqual(out["decision"]["differenceVsNext"]["lotTotal"], expected * out["quantityQuintals"], places=2)

    def test_break_even_transport_math(self):
        """Nashik farmer: Nashik 50 km @ ₹1850 is #1; Pune 210 km @ ₹1950 pays
        ₹100/q more headline over 160 km more. Pune overtakes only if the rate
        FALLS below 100/160 = ₹0.625/q/km. Current rate 1.5 → headroom offered
        in the 'falls_below' direction."""
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        be = out["decision"]["breakEvenTransport"]
        self.assertIsNotNone(be)
        self.assertEqual(be["challenger"], "Pune")
        self.assertEqual(be["direction"], "falls_below")
        self.assertGreater(be["breakEvenRatePerQuintalPerKm"], 0.6)
        self.assertLess(be["breakEvenRatePerQuintalPerKm"], 0.65)
        self.assertGreater(be["currentRatePerQuintalPerKm"], be["breakEvenRatePerQuintalPerKm"])

    def test_break_even_transport_rises_above_direction(self):
        """Kolhapur farmer: Satara (125 km) @ ₹2100 beats local Kolhapur (50 km)
        @ ₹1780 because its headline edge survives transport. Kolhapur overtakes
        only if the rate RISES above 320/75 = ₹4.27/q/km."""
        prices = [
            {"market": "Kolhapur", "modalPrice": 1780},
            {"market": "Satara", "modalPrice": 2100},
        ]
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Kolhapur", quantity=10, prices=prices))
        self.assertEqual(out["bestMandi"], "Satara")
        be = out["decision"]["breakEvenTransport"]
        self.assertIsNotNone(be)
        self.assertEqual(be["challenger"], "Kolhapur")
        self.assertEqual(be["direction"], "rises_above")
        self.assertGreater(be["breakEvenRatePerQuintalPerKm"], be["currentRatePerQuintalPerKm"])

    def test_close_call_flagged_only_below_threshold(self):
        """Lasalgaon (45 km) @ ₹1856 vs Nashik (50 km) @ ₹1850: near-identical
        economics → ₹13.5/q apart, below the ₹25 documented threshold."""
        close = [
            {"market": "Nashik", "modalPrice": 1850},
            {"market": "Lasalgaon", "modalPrice": 1856},
        ]
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=close))
        d = out["decision"]
        self.assertTrue(d["closeCall"]["isCloseCall"])
        self.assertIsNotNone(d["closeCall"]["message"])
        # and the opposite: a wide gap must NOT be a close call
        wide = [
            {"market": "Nashik", "modalPrice": 1850},
            {"market": "Lasalgaon", "modalPrice": 2600},
        ]
        out2 = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=wide))
        self.assertFalse(out2["decision"]["closeCall"]["isCloseCall"])

    def test_robustness_scenarios_run_same_engine(self):
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        rob = out["decision"]["robustness"]
        self.assertEqual(len(rob["scenarios"]), 3)
        for s in rob["scenarios"]:
            self.assertIn("sameWinner", s)
        self.assertIn(rob["verdict"], ("ROBUST", "SENSITIVE"))
        # quantity doubled → 20 q, still below the 40 q bulk threshold for LCV tier;
        # the winner is whatever the same cost model says — consistency is what matters.
        qd = next(s for s in rob["scenarios"] if s["scenario"] == "quantity_doubled")
        self.assertIsNotNone(qd["bestMandi"])

    def test_confidence_rules_documented(self):
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        c = out["decision"]["confidence"]
        self.assertIn(c["level"], ("STRONG", "GOOD", "CAUTION", "LIMITED"))
        self.assertIn("Not an ML/AI confidence", c["note"])
        # quotes dated 2026-09-06 vs run date → age ≥ 2 days when run today;
        # either a watch signal or good signal must exist and be honest.
        self.assertTrue(c["goodSignals"] or c["watchSignals"])

    def test_single_mandi_does_not_crash(self):
        """Red-team: only one rankable mandi must not crash the decision layer."""
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=[{"market": "Nashik", "modalPrice": 1850}]))
        d = out["decision"]
        self.assertEqual(d["recommended"]["market"], "Nashik")
        self.assertIsNone(d["recommended"]["alternative"])
        self.assertIsNone(d["differenceVsNext"])
        self.assertFalse(d["closeCall"]["isCloseCall"])
        self.assertIn("no alternative", d["closeCall"]["message"])

    def test_negative_net_flagged_not_hidden(self):
        """Red-team: a mandi that wouldn't cover farmer-borne costs must carry
        an explicit economics warning instead of a bare rank number."""
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=[
            {"market": "Nagpur", "modalPrice": 100},
            {"market": "Nashik", "modalPrice": 1850},
        ]))
        warns = out["decision"]["recommended"]["economicsWarnings"]
        self.assertTrue(any("Nagpur" in w for w in warns))
        # positive case: no warnings when all economics are sane
        out2 = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        self.assertEqual(out2["decision"]["recommended"]["economicsWarnings"], [])

    def test_outlier_quote_flagged_not_silently_ranked(self):
        """Red-team: one absurd quote (upstream data error) must not produce a
        confident recommendation. Flagged, trust degraded — never hidden."""
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=[
            {"market": "Nashik", "modalPrice": 1850},
            {"market": "Pune", "modalPrice": 1950},
            {"market": "Nagpur", "modalPrice": 50000},
        ]))
        d = out["decision"]
        self.assertTrue(any("Nagpur" in w for w in d["recommended"]["economicsWarnings"]))
        self.assertIn("Outlier", " ".join(d["confidence"]["watchSignals"]))
        nagpur = next(m for m in out["rankedMandis"] if m["market"] == "Nagpur")
        self.assertTrue(nagpur["evidence"]["outlier"])
        # clean data → no warnings
        out2 = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        self.assertEqual(out2["decision"]["recommended"]["economicsWarnings"], [])

    def test_without_with_comparison_engine_owned(self):
        """Phase 21: naive-vs-recommended comparison computed by the engine from
        its own ranking — 'naive choice pays the highest headline'."""
        out = compute_net_realization(NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=onion_prices()))
        cmp_ = out["decision"]["withoutWith"]
        self.assertEqual(cmp_["naive"]["basis"], "highest headline price")
        self.assertEqual(cmp_["recommended"]["basis"], "highest estimated farmer net")
        self.assertEqual(cmp_["naive"]["market"], "Pune")
        self.assertEqual(cmp_["recommended"]["market"], "Nashik")
        self.assertEqual(cmp_["differencePerQuintal"], cmp_["recommended"]["netPerQuintal"] - cmp_["naive"]["netPerQuintal"])
        # inversion case: difference must be positive (naive choice is worse)
        self.assertGreater(cmp_["differencePerQuintal"], 0)
        # non-inversion case: same market, zero difference, message honest
        out2 = compute_net_realization(NetRealizationRequest(crop="Onion", district="Kolhapur", quantity=10, prices=[
            {"market": "Satara", "modalPrice": 2100},
            {"market": "Kolhapur", "modalPrice": 1780},
        ]))
        cmp2 = out2["decision"]["withoutWith"]
        self.assertEqual(cmp2["naive"]["market"], cmp2["recommended"]["market"])
        self.assertEqual(cmp2["differencePerQuintal"], 0)



class MarketMatchingTests(unittest.TestCase):
    """Expanded market name matching and geodesic distance fallback."""

    def test_find_canonical_mandi_expanded_aliases(self):
        """APMC-prefixed market names must resolve to canonical mandis."""
        from net_realization import find_canonical_mandi
        cases = [
            ('APMC Sangli ', 'Sangli'),
            ('APMC Wardha ', 'Wardha'),
            ('APMC Parbhani ', 'Parbhani'),
            ('APMC Ahilyanagar ', 'Ahmednagar'),
            ('APMC Chattrapati Sambhajinagar ', 'Aurangabad'),
            ('APMC Tuljapur ', 'Solapur'),
            ('APMC Nagpur ', 'Nagpur'),
            ('APMC Pune ', 'Pune'),
            ('Lasalgaon(Niphad) ', 'Lasalgaon'),
            ('Pune(Moshi) ', 'Pune'),
        ]
        for market, expected in cases:
            result = find_canonical_mandi(market)
            self.assertEqual(result, expected, f'{market} -> expected {expected}, got {result}')

    def test_geodesic_distance_deterministic(self):
        """Geodesic distance must be deterministic and positive for distinct points."""
        from net_realization import geodesic_km
        # Nashik to Pune: roughly 170 km geodesic
        km = geodesic_km(19.9975, 73.7898, 18.5204, 73.8567)
        self.assertGreater(km, 100)
        self.assertLess(km, 250)
        # Same point -> 0
        self.assertAlmostEqual(geodesic_km(19.9975, 73.7898, 19.9975, 73.7898), 0, places=1)

    def test_geodesic_fallback_used_when_no_table_distance(self):
        """Markets not in the road-distance table should get geodesic distance
        when market coordinates or district is provided."""
        from net_realization import distance_km
        # Wardha is NOT in DISTANCES_KM table, but we have market coordinates
        km, src = distance_km('Nashik', 'APMC Wardha ', market_district='Wardha')
        self.assertIn(src, ('GEODESIC_MARKET', 'GEODESIC_DISTRICT'))
        self.assertGreater(km, 0)

    def test_unavailable_when_no_district_coords(self):
        """Markets with no district info and no table distance must be unavailable."""
        from net_realization import distance_km
        km, src = distance_km('Nashik', 'UnknownMarket', market_district=None)
        self.assertEqual(src, 'UNAVAILABLE')
        self.assertEqual(km, 0)

    def test_table_distance_preferred_over_geodesic(self):
        """When road distance exists, it must be used instead of geodesic."""
        from net_realization import distance_km
        km, src = distance_km('Nashik', 'Nashik', market_district='Nashik')
        self.assertEqual(src, 'DOCUMENTED_ROAD')
        self.assertEqual(km, 50)

    def test_geodesic_market_ranked_in_computation(self):
        """A market with only geodesic distance must appear in ranked results."""
        prices = [
            {"market": "Nashik", "modalPrice": 1850, "district": "Nashik"},
            {"market": "APMC Wardha ", "modalPrice": 2100, "district": "Wardha"},
        ]
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=prices)
        )
        markets = [m["market"] for m in out["rankedMandis"]]
        self.assertTrue(any('wardha' in m.lower() for m in markets),
                        f'APMC Wardha should be ranked, got: {markets}')
        wardha = next(m for m in out["rankedMandis"] if 'wardha' in m["market"].lower())
        self.assertIn(wardha["distanceSource"], ('GEODESIC_MARKET', 'GEODESIC_DISTRICT'))

    def test_no_synthetic_150km_fallback(self):
        """The old 150km default must never appear in ranked results."""
        prices = [
            {"market": "Nashik", "modalPrice": 1850, "district": "Nashik"},
            {"market": "APMC Sangli ", "modalPrice": 2000, "district": "Sangli"},
        ]
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=prices)
        )
        for m in out["rankedMandis"]:
            self.assertNotEqual(m["distanceSource"], "default_150km",
                                f'{m["market"]} must not use synthetic 150km')
            self.assertNotEqual(m["distanceSource"], "UNAVAILABLE",
                                f'{m["market"]} must have a usable distance')

    def test_same_district_nonzero_distance(self):
        """Same district does NOT mean zero distance when market coordinates exist."""
        from net_realization import distance_km
        # Pimpalgaon Baswant is in Nashik district but physically ~25km from Nashik city
        km, src = distance_km('Nashik', 'APMC Pimpalgaon Baswant ', market_district='Nashik')
        self.assertGreater(km, 5, 'Pimpalgaon Baswant should have non-zero distance from Nashik')
        self.assertLess(km, 100, 'Pimpalgaon Baswant should be a local market')
        self.assertIn(src, ('GEODESIC_MARKET', 'DOCUMENTED_ROAD'))

        # Sinnar is in Nashik district but ~30km from Nashik city
        km2, src2 = distance_km('Nashik', 'APMC Sinner ', market_district='Nashik')
        self.assertGreater(km2, 5, 'Sinnar should have non-zero distance from Nashik')
        self.assertLess(km2, 100, 'Sinnar should be a local market')

    def test_market_coordinates_preferred_over_district(self):
        """When market coordinates exist, they must be preferred over district centroids."""
        from net_realization import distance_km, _get_market_coords, _get_district_coords
        # Lasalgaon has market coordinates that differ from Nashik district centroid
        market_coords = _get_market_coords('Lasalgaon(Niphad) ')
        district_coords = _get_district_coords('Nashik')
        self.assertIsNotNone(market_coords)
        self.assertIsNotNone(district_coords)
        # They should be different (Lasalgaon is ~30km from Nashik city)
        self.assertNotAlmostEqual(market_coords[0], district_coords[0], places=1)

    def test_onion_nashik_10q_expanded_markets(self):
        """Onion/Nashik/10q must now rank many more markets than before."""
        # Use realistic snapshot-like prices for multiple markets
        prices = [
            {"market": "Lasalgaon(Niphad) ", "modalPrice": 1856, "district": "Nashik"},
            {"market": "APMC Pune ", "modalPrice": 1950, "district": "Pune"},
            {"market": "APMC Nagpur ", "modalPrice": 1800, "district": "Nagpur"},
            {"market": "APMC Sangli ", "modalPrice": 2000, "district": "Sangli"},
            {"market": "APMC Wardha ", "modalPrice": 2100, "district": "Wardha"},
            {"market": "APMC Parbhani ", "modalPrice": 1900, "district": "Parbhani"},
            {"market": "APMC Hingoli ", "modalPrice": 1850, "district": "Hingoli"},
            {"market": "APMC Solapur ", "modalPrice": 1720, "district": "Solapur"},
            {"market": "APMC Kolhapur ", "modalPrice": 1780, "district": "Kolhapur"},
            {"market": "APMC Ratnagiri (Nachane) ", "modalPrice": 2200, "district": "Ratnagiri"},
        ]
        out = compute_net_realization(
            NetRealizationRequest(crop="Onion", district="Nashik", quantity=10, prices=prices)
        )
        # All 10 markets should be ranked (none skipped)
        self.assertEqual(len(out["rankedMandis"]), 10)
        self.assertEqual(len(out["skippedMarkets"]), 0)
        # Rankings should be by farmer net descending
        nets = [m["farmerNetPerQuintal"] for m in out["rankedMandis"]]
        self.assertEqual(nets, sorted(nets, reverse=True))
        # Both documented road and geodesic distances should appear
        sources = {m["distanceSource"] for m in out["rankedMandis"]}
        self.assertIn("DOCUMENTED_ROAD", sources)
        self.assertTrue(any(s.startswith('GEODESIC') for s in sources),
                        f'Expected geodesic distance, got: {sources}')


if __name__ == "__main__":
    unittest.main()
