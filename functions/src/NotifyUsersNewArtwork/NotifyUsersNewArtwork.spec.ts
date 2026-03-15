import { InvocationContext } from "@azure/functions";

const mockLogger = {
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const mockMetrics = {
  increment: jest.fn(),
  timing: jest.fn(),
};

const mockEmailPoller = {
  pollUntilDone: jest.fn().mockResolvedValue(undefined),
};

const mockEmailClient = {
  beginSend: jest.fn().mockResolvedValue(mockEmailPoller),
};

const mockArtworksContainer = {
  item: jest.fn(),
};

const mockUsersContainer = {
  items: {
    query: jest.fn(),
  },
};

const mockCosmosService = {
  getArtworksContainer: jest.fn(() => mockArtworksContainer),
  getContainer: jest.fn(() => mockUsersContainer),
};

const buildVector = (firstValue: number, secondValue: number = 0): number[] => {
  const vector = new Array(1024).fill(0);
  vector[0] = firstValue;
  vector[1] = secondValue;
  return vector;
};

jest.mock("@azure/communication-email", () => ({
  EmailClient: jest.fn(() => mockEmailClient),
}));

jest.mock("@tastematcher/common", () => ({
  CosmosService: jest.fn(() => mockCosmosService),
  createLogger: jest.fn(() => mockLogger),
  metrics: mockMetrics,
  normalizeVector: jest.fn((vector: number[]) => {
    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    return magnitude === 0
      ? new Array(vector.length).fill(0)
      : vector.map((value) => value / magnitude);
  }),
  cosineSimilarity: jest.fn((left: number[], right: number[]) =>
    left.reduce((sum, value, index) => sum + value * right[index], 0),
  ),
  getAIRecommendationsEligibility: jest.fn(() => ({
    isEligible: true,
    reasons: [],
  })),
}));

describe("NotifyUsersNewArtwork", () => {
  let notifyUsersNewArtwork: typeof import("./NotifyUsersNewArtwork").notifyUsersNewArtwork;
  const context = {
    invocationId: "notify-invocation-id",
  } as InvocationContext;

  beforeEach(async () => {
    process.env.NEW_ARTWORK_QUEUE_NAME = "notify-users";
    process.env.AZURE_COMMUNICATION_CONNECTION_STRING = "endpoint=fake";
    process.env.AZURE_EMAIL_SENDER = "noreply@tastematcher.art";
    process.env.FRONTEND_URL = "https://tastematcher.art";
    process.env.NODE_ENV = "prd";

    jest.resetModules();
    jest.clearAllMocks();

    ({ notifyUsersNewArtwork } = require("./NotifyUsersNewArtwork"));

    mockArtworksContainer.item.mockReturnValue({
      read: jest.fn().mockResolvedValue({
        resource: {
          id: "artwork-1",
          domainId: "domain-1",
          title: "Artwork 1",
          description: "Artwork description",
          artist: "Artist",
          filename: "https://blob/artwork-1.jpg",
          vector: buildVector(1),
          isPrivate: false,
          shouldDisplayPrice: false,
        },
      }),
    });

    mockUsersContainer.items.query.mockReturnValue({
      fetchAll: jest.fn().mockResolvedValue({
        resources: [
          {
            id: "user-1",
            domainId: "domain-1",
            email: "one@example.com",
            name: "One",
            role: "customer",
            status: "active",
            onboardingStatus: "completed",
            swipeCount: 30,
            preferenceVector: buildVector(1),
          },
          {
            id: "user-2",
            domainId: "domain-1",
            email: "two@example.com",
            name: "Two",
            role: "customer",
            status: "active",
            onboardingStatus: "completed",
            swipeCount: 30,
            preferenceVector: buildVector(0, 1),
          },
        ],
      }),
    });
  });

  it("scores users from cosmos vectors and emails only strong matches", async () => {
    await notifyUsersNewArtwork(
      {
        messageId: "msg-1",
        artworkId: "artwork-1",
        domainId: "domain-1",
        uploadedAt: Date.now(),
      },
      context,
    );

    expect(mockCosmosService.getArtworksContainer).toHaveBeenCalled();
    expect(mockCosmosService.getContainer).toHaveBeenCalledWith("Core");
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "New artwork notifications completed",
        recipients: 1,
      }),
    );
  });

  it("skips notifications when the artwork vector is invalid", async () => {
    mockArtworksContainer.item.mockReturnValue({
      read: jest.fn().mockResolvedValue({
        resource: {
          id: "artwork-1",
          domainId: "domain-1",
          vector: [],
          isPrivate: false,
        },
      }),
    });

    await notifyUsersNewArtwork(
      {
        messageId: "msg-2",
        artworkId: "artwork-1",
        domainId: "domain-1",
        uploadedAt: Date.now(),
      },
      context,
    );

    expect(mockEmailClient.beginSend).not.toHaveBeenCalled();
  });
});
