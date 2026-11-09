import { CROPS, DISTRICTS } from "../data/maharashtra";

describe("maharashtra picker data", () => {
  test("has crops and districts for the demo", () => {
    expect(CROPS.length).toBeGreaterThan(15);
    expect(DISTRICTS.length).toBeGreaterThan(15);
    expect(CROPS).toContain("Onion");
    expect(DISTRICTS).toContain("Nashik");
  });

  test("no duplicates", () => {
    expect(new Set(CROPS).size).toBe(CROPS.length);
    expect(new Set(DISTRICTS).size).toBe(DISTRICTS.length);
  });
});
