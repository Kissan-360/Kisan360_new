import {
  isUnread,
  notificationRoute,
  parseSeenAt,
  sortNotifications,
  unreadCount,
} from "../services/notificationState";

describe("mobile notification state", () => {
  test("maps backend routes to mobile screens", () => {
    expect(notificationRoute({ id: "1", to: "/trade" })).toBe("Trade");
    expect(notificationRoute({ id: "2", to: "/advisory" })).toBe("Chat");
    expect(notificationRoute({ id: "3", to: "/weather" })).toBe("Decision");
    expect(notificationRoute({ id: "4" })).toBeNull();
  });

  test("seen-at parsing is safe for missing values", () => {
    expect(parseSeenAt(null)).toBe(0);
    expect(parseSeenAt("garbage")).toBe(0);
    expect(parseSeenAt("123")).toBe(123);
  });

  test("unread derives from stable createdAt timestamps", () => {
    const seenAt = Date.parse("2026-11-09T10:00:00.000Z");
    expect(isUnread({ id: "a", createdAt: "2026-11-09T09:00:00.000Z" }, seenAt)).toBe(false);
    expect(isUnread({ id: "b", createdAt: "2026-11-09T11:00:00.000Z" }, seenAt)).toBe(true);
    expect(
      unreadCount([
        { id: "a", createdAt: "2026-11-09T09:00:00.000Z" },
        { id: "b", createdAt: "2026-11-09T11:00:00.000Z" },
      ], seenAt),
    ).toBe(1);
  });

  test("sorts newest first without mutating input", () => {
    const input = [
      { id: "old", createdAt: "2026-11-08T00:00:00.000Z" },
      { id: "new", createdAt: "2026-11-09T00:00:00.000Z" },
    ];
    const sorted = sortNotifications(input);
    expect(sorted.map((n) => n.id)).toEqual(["new", "old"]);
    expect(input.map((n) => n.id)).toEqual(["old", "new"]);
  });
});
