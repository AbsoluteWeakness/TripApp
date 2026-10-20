import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PersonalCabinet from "./PersonalCabinet.jsx";

const { deleteTripMock, getTripsMock, regenerateTripMock } = vi.hoisted(() => ({
  deleteTripMock: vi.fn(),
  getTripsMock: vi.fn(),
  regenerateTripMock: vi.fn(),
}));

vi.mock("./api.js", () => ({
  deleteTrip: deleteTripMock,
  getTrips: getTripsMock,
  normalizeTrip: (trip) => ({
    ...trip,
    budget: Number(trip.budget || 0),
    travelers: Number(trip.travelers || 1),
    code: String(trip.city || "").slice(0, 3).toUpperCase(),
    dateRange: "22–24 октября",
    status: String(trip.status || "DRAFT").toLowerCase(),
    days: [],
  }),
  regenerateTrip: regenerateTripMock,
}));

const testTrip = {
  id: "trip-1",
  city: "Казань",
  status: "READY",
  budget: "25000",
  travelers: 2,
  startDate: "2026-10-22",
  endDate: "2026-10-24",
};

describe("PersonalCabinet", () => {
  beforeEach(() => {
    getTripsMock.mockReset();
    deleteTripMock.mockReset();
    regenerateTripMock.mockReset();
  });

  it("shows loading state and then renders loaded trips", async () => {
    let resolveTrips;
    getTripsMock.mockReturnValueOnce(new Promise((resolve) => { resolveTrips = resolve; }));
    const setTrips = vi.fn();

    render(
      <PersonalCabinet
        trips={[]}
        setTrips={setTrips}
        user={{ id: "user-1" }}
        onAuthenticated={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onNewTrip={vi.fn()}
      />,
    );

    expect(screen.getByText("Загружаем путешествия…")).toBeInTheDocument();
    resolveTrips([testTrip]);

    await waitFor(() => expect(setTrips).toHaveBeenCalled());
    expect(setTrips.mock.calls[0][0][0]).toMatchObject({ city: "Казань", status: "ready" });
  });

  it("shows a service error when trips cannot be loaded", async () => {
    getTripsMock.mockRejectedValueOnce(new Error("Сессия истекла"));
    render(
      <PersonalCabinet
        trips={[]}
        setTrips={vi.fn()}
        user={{ id: "user-1" }}
        onAuthenticated={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onNewTrip={vi.fn()}
      />,
    );

    expect(await screen.findByText("Сессия истекла")).toBeInTheDocument();
  });

  it("requires confirmation before deleting a trip and calls the delete service", async () => {
    const user = userEvent.setup();
    const setTrips = vi.fn();
    getTripsMock.mockResolvedValueOnce([testTrip]);
    deleteTripMock.mockResolvedValueOnce({ id: testTrip.id });

    render(
      <PersonalCabinet
        trips={[{ ...testTrip, status: "ready", budget: 25000, travelers: 2, code: "КАЗ", dateRange: "22–24 октября" }]}
        setTrips={setTrips}
        user={{ id: "user-1" }}
        onAuthenticated={vi.fn()}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onNewTrip={vi.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: "Удалить" }));
    expect(screen.getByText("Удалить путешествие?")).toBeInTheDocument();
    expect(deleteTripMock).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole("button", { name: "Удалить" }).at(-1));

    await waitFor(() => expect(deleteTripMock).toHaveBeenCalledWith("trip-1"));
    expect(setTrips).toHaveBeenCalledWith(expect.any(Function));
    expect(screen.queryByText("Удалить путешествие?")).not.toBeInTheDocument();
  });

  it("removes the stored user and notifies the app on logout", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    getTripsMock.mockResolvedValueOnce([]);
    localStorage.setItem("tripPlannerUser", "stored-user");

    render(
      <PersonalCabinet
        trips={[]}
        setTrips={vi.fn()}
        user={{ id: "user-1" }}
        onAuthenticated={onAuthenticated}
        onOpen={vi.fn()}
        onEdit={vi.fn()}
        onNewTrip={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Выйти" }));
    expect(onAuthenticated).toHaveBeenCalledWith(null);
    expect(localStorage.getItem("tripPlannerUser")).toBeNull();
  });
});