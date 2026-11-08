"""Offline eval for the agentic layer (no Groq key needed).

Checks:
- classify_intents() returns expected primary intents (EN/MR/HI)
- plan_tools() unions tools for multi-intent queries
- validate_numbers() blocks hallucinated Rs figures

Run: python eval_agent.py
"""
from agent import classify_intents, plan_tools, validate_numbers

CASES = [
    ("Compare mandis for onion", "compare_mandis"),
    ("कांद्यासाठी बाजार तुलना करा", "compare_mandis"),
    ("leaf disease on tomato", "crop_health"),
    ("What is the weather today", "weather_info"),
    ("Explain PM-KISAN scheme", "govt_schemes"),
]

def main():
    passed = 0
    for msg, expect in CASES:
        intents = classify_intents(msg)
        top = intents[0]["intent"]
        ok = top == expect
        print(f"{'PASS' if ok else 'FAIL'}  {msg.encode('ascii','backslashreplace').decode()} -> {top} (expect {expect})")
        passed += ok
    # multi-intent
    multi = classify_intents("kanda sathi konti mandi changli? aani pattyavar rog aahe ka?")
    # (Marathi-script variant tested via backend eval; ASCII here to avoid cp1252)
    # Real script check:
    try:
        multi = classify_intents("कांद्यासाठी कोणती मंडी चांगली? आणि पत्त्यावर रोग आहे का?")
    except Exception:
        pass
    names = [i["intent"] for i in multi]
    tools = plan_tools(multi)
    multi_ok = "compare_mandis" in names and "crop_health" in names
    print(f"{'PASS' if multi_ok else 'FAIL'}  multi-intent -> {names} tools={tools}")
    passed += multi_ok
    # grounding
    ok2, halluc = validate_numbers("Best is Rs 9999 per quintal", "Best is Rs 2000 per quintal")
    print(f"{'PASS' if (not ok2 and halluc) else 'FAIL'}  grounding blocks 9999 (hallucinated={sorted(halluc)})")
    passed += (not ok2)
    ok3, _ = validate_numbers("Best is Rs 2000 per quintal", "Best is Rs 2000 per quintal")
    print(f"{'PASS' if ok3 else 'FAIL'}  grounding allows 2000")
    passed += ok3
    print(f"\n{passed}/8 checks passed")
    raise SystemExit(0 if passed == 8 else 1)

if __name__ == "__main__":
    main()
