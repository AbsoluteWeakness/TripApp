import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlaceAlternatives,
  getTrips,
  normalizeTrip,
  sendAssistantRequest,
} from "./api.js";

describe("API helpers", () => {
  beforeEach(() => {
    localStorage.setItem("tripPlannerToken", "test-token");
  });

  it("sends the saved token and parses successful responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ id: "trip-1" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTrips()).resolves.toEqual([{ id: "trip-1" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/trips",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("encodes query values for place alternatives", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal("fetch", fetchMock);

    await getPlaceAlternatives("trip-1", "FOOD & DRINK");

    expect(fetchMock.mock.calls[0][0]).toBe(
      "http://localhost:3000/api/v1/trips/trip-1/places?category=FOOD%20%26%20DRINK",
    );
  });

  it("sends assistant messages with the selected day", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Готово" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendAssistantRequest("trip-1", "Уменьши расходы", "day-2");

    expect(fetchMock.mock.calls[0][0]).toBe("http://localhost:3000/api/v1/trips/trip-1/assistant");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      message: "Уменьши расходы",
      dayId: "day-2",
    });
  });

  it("surfaces API errors and falls back when the error body is not JSON", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Нет доступа" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => { throw new Error("invalid json"); } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getTrips()).rejects.toThrow("Нет доступа");
    await expect(getTrips()).rejects.toThrow("Не удалось выполнить запрос");
  });

  it("normalizes incomplete trip records and nested activities", () => {
    const trip = normalizeTrip({
      city: "Казань",
      status: "READY",
      budget: "12000",
      travelers: "2",
      days: [{
        id: "day-1",
        date: "2026-10-20T00:00:00.000Z",
        activities: [{
          id: "activity-1",
          place: { name: "Кремль", category: "HISTORY", latitude: "55.79", longitude: "49.11" },
          cost: "400",
          durationMinutes: 75,
        }],
      }],
    });

    expect(trip).toMatchObject({
      city: "Казань",
      budget: 12000,
      travelers: 2,
      code: "КАЗ",
      status: "ready",
    });
    expect(trip.days[0].activities[0]).toMatchObject({
      name: "Кремль",
      category: "history",
      latitude: 55.79,
      longitude: 49.11,
      cost: 400,
      duration: 75,
    });
    expect(normalizeTrip({}).city).toBe("Неизвестный город");
  });
});