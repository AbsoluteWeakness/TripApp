import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItineraryPage from "./ItineraryPage.jsx";

const {
  getPlaceAlternativesMock,
  getTripMock,
  normalizeDayMock,
  normalizeTripMock,
  optimizeBudgetMock,
  regenerateDayMock,
  sendAssistantRequestMock,
  updateActivityMock,
} = vi.hoisted(() => ({
  getPlaceAlternativesMock: vi.fn(),
  getTripMock: vi.fn(),
  normalizeDayMock: vi.fn((day) => day),
  normalizeTripMock: vi.fn((trip) => trip),
  optimizeBudgetMock: vi.fn(),
  regenerateDayMock: vi.fn(),
  sendAssistantRequestMock: vi.fn(),
  updateActivityMock: vi.fn(),
}));

vi.mock("./api.js", () => ({
  getPlaceAlternatives: getPlaceAlternativesMock,
  getTrip: getTripMock,
  normalizeDay: normalizeDayMock,
  normalizeTrip: normalizeTripMock,
  optimizeBudget: optimizeBudgetMock,
  regenerateDay: regenerateDayMock,
  sendAssistantRequest: sendAssistantRequestMock,
  updateActivity: updateActivityMock,
  removeActivity: vi.fn(),
  reorderActivities: vi.fn(),
}));

function activity(id, name, category = "food", cost = 400) {
  return { id, placeId: `place-${id}`, name, category, duration: 60, cost, travelNext: 0 };
}

function tripFixture() {
  return {
    id: "trip-1",
    city: "Казань",
    dateRange: "22–24 октября",
    travelers: 1,
    budget: 500,
    days: [
      { id: "day-1", label: "День 1", date: "22 октября", activities: [activity("a1", "Кафе у Кремля", "food", 800)] },
      { id: "day-2", label: "День 2", date: "23 октября", activities: [activity("a2", "Казанский Кремль", "history", 200)] },
    ],
  };
}

describe("ItineraryPage", () => {
  beforeEach(() => {
    getPlaceAlternativesMock.mockReset();
    getTripMock.mockReset();
    normalizeDayMock.mockImplementation((day) => day);
    normalizeTripMock.mockImplementation((trip) => trip);
    optimizeBudgetMock.mockReset();
    regenerateDayMock.mockReset();
    sendAssistantRequestMock.mockReset();
    updateActivityMock.mockReset();
  });

  it("renders the first day and switches to another day", async () => {
    const user = userEvent.setup();
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    expect(screen.getAllByText("Кафе у Кремля").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /День 2/ }));
    expect(screen.getAllByText("Казанский Кремль").length).toBeGreaterThan(0);
    expect(screen.queryByText("Кафе у Кремля")).not.toBeInTheDocument();
  });

  it("shows pending and updated states while regenerating a day", async () => {
    const user = userEvent.setup();
    let resolveRegeneration;
    regenerateDayMock.mockReturnValueOnce(new Promise((resolve) => { resolveRegeneration = resolve; }));
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Пересобрать этот день" }));
    expect(screen.getByRole("button", { name: "Пересобираем день…" })).toBeDisabled();
    expect(regenerateDayMock).toHaveBeenCalledWith("trip-1", "day-1");

    resolveRegeneration({
      ...tripFixture().days[0],
      activities: [activity("a3", "Новая точка маршрута")],
    });

    expect((await screen.findAllByText("Новая точка маршрута")).length).toBeGreaterThan(0);
  });

  it("loads and applies a place alternative", async () => {
    const user = userEvent.setup();
    getPlaceAlternativesMock.mockResolvedValueOnce([
      { id: "place-new", name: "Новое кафе", category: "FOOD", rating: 4.5 },
    ]);
    updateActivityMock.mockResolvedValueOnce({
      ...tripFixture().days[0],
      activities: [activity("a1", "Новое кафе")],
    });
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Заменить место" }));
    expect(getPlaceAlternativesMock).toHaveBeenCalledWith("trip-1", "FOOD");
    await user.click(await screen.findByRole("button", { name: /Новое кафе/ }));

    await waitFor(() => expect(updateActivityMock).toHaveBeenCalledWith("trip-1", "a1", "place-new"));
    expect(screen.getAllByText("Новое кафе").length).toBeGreaterThan(0);
  });

  it("submits an assistant request for the active day and displays its reply", async () => {
    const user = userEvent.setup();
    sendAssistantRequestMock.mockResolvedValueOnce({ reply: "Оставил только реальные места.", applied: false });
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Например: добавь больше прогулок или сократи расходы"), "Сократи расходы");
    await user.click(screen.getByRole("button", { name: "Спросить" }));

    expect(sendAssistantRequestMock).toHaveBeenCalledWith("trip-1", "Сократи расходы", "day-1");
    expect(await screen.findByRole("status")).toHaveTextContent("Оставил только реальные места.");
  });

  it("optimizes an over-budget itinerary and shows the service result", async () => {
    const user = userEvent.setup();
    optimizeBudgetMock.mockResolvedValueOnce({
      changed: 1,
      trip: {
        days: [
          { ...tripFixture().days[0], activities: [activity("a1", "Бюджетное кафе", "food", 200)] },
          tripFixture().days[1],
        ],
      },
    });
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Оптимизировать" }));

    expect(optimizeBudgetMock).toHaveBeenCalledWith("trip-1");
    expect(await screen.findByText("Заменено активностей: 1")).toBeInTheDocument();
    expect(screen.getAllByText("Бюджетное кафе").length).toBeGreaterThan(0);
  });

  it("displays service errors for day regeneration", async () => {
    const user = userEvent.setup();
    regenerateDayMock.mockRejectedValueOnce(new Error("Не удалось пересобрать день"));
    render(<ItineraryPage trip={tripFixture()} onBack={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Пересобрать этот день" }));

    expect(await screen.findByText("Не удалось пересобрать день")).toBeInTheDocument();
  });
});