import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App.jsx";

const {
  createTripMock,
  getTripMock,
  getTripStatusMock,
  normalizeTripMock,
  regenerateTripMock,
  updateTripMock,
} = vi.hoisted(() => ({
  createTripMock: vi.fn(),
  getTripMock: vi.fn(),
  getTripStatusMock: vi.fn(),
  normalizeTripMock: vi.fn((trip) => trip),
  regenerateTripMock: vi.fn(),
  updateTripMock: vi.fn(),
}));

vi.mock("./api.js", () => ({
  createTrip: createTripMock,
  getTrip: getTripMock,
  getTripStatus: getTripStatusMock,
  normalizeTrip: normalizeTripMock,
  regenerateTrip: regenerateTripMock,
  updateTrip: updateTripMock,
}));

vi.mock("./TripPlannerForm.jsx", () => ({
  default: ({ onGenerated }) => (
    <button
      type="button"
      onClick={() => onGenerated({
        destination: "Казань",
        country: "Россия",
        startDate: "2026-10-25",
        endDate: "2026-10-27",
        travelers: 2,
        budget: 30000,
        pace: "medium",
        categories: ["food", "history"],
      }).catch(() => undefined)}
    >
      Simulate trip submission
    </button>
  ),
}));

vi.mock("./ItineraryPage.jsx", () => ({
  default: ({ trip, onBack }) => (
    <section>
      <h1>{trip?.city}</h1>
      <button type="button" onClick={onBack}>Return to form</button>
    </section>
  ),
}));

vi.mock("./PersonalCabinet.jsx", () => ({
  default: () => <h1>Cabinet screen</h1>,
}));

describe("App navigation and trip creation", () => {
  it("converts form values to the API payload and opens the generated itinerary", async () => {
    const user = userEvent.setup();
    localStorage.setItem("tripPlannerToken", "token-1");
    createTripMock.mockResolvedValueOnce({ id: "trip-1", status: "READY" });
    getTripMock.mockResolvedValueOnce({ id: "trip-1", city: "Казань", status: "READY", days: [] });
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Simulate trip submission" }));

    expect(createTripMock).toHaveBeenCalledWith({
      city: "Казань",
      country: "Россия",
      startDate: "2026-10-25",
      endDate: "2026-10-27",
      travelers: 2,
      budget: 30000,
      pace: "MEDIUM",
      categories: ["FOOD", "HISTORY"],
    });
    expect(await screen.findByRole("heading", { name: "Казань" })).toBeInTheDocument();
    expect(getTripMock).toHaveBeenCalledWith("trip-1");
  });

  it("requires authentication before creating a trip and routes to the cabinet", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Simulate trip submission" }));

    expect(createTripMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("heading", { name: "Cabinet screen" })).toBeInTheDocument();
  });
});