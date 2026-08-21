import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  const mockAuthService = {
    requestLoginCode: jest.fn(),
    verifyLoginCode: jest.fn(),
  };
  const mockDomainsService = {
    createDomainRequest: jest.fn(),
    createDomainWithAdmin: jest.fn(),
  };
  const mockUsersService = {
    createCustomerRequest: jest.fn(),
  };

  let controller: AuthController;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    controller = new AuthController(
      mockAuthService as never,
      mockDomainsService as never,
      mockUsersService as never,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("delegates login requests to AuthService", async () => {
    const dto = { email: "user@example.com" };
    mockAuthService.requestLoginCode.mockResolvedValue({
      message: "Verification code sent to your email",
    });

    await expect(controller.requestLogin(dto)).resolves.toEqual({
      message: "Verification code sent to your email",
    });

    expect(mockAuthService.requestLoginCode).toHaveBeenCalledWith(dto);
  });

  it("creates a customer request via UsersService", async () => {
    const dto = {
      name: "Ada",
      email: "ada@example.com",
      message: "Interested in a catalog invite",
    };
    mockUsersService.createCustomerRequest.mockResolvedValue({
      id: "request-1",
      ...dto,
    });

    await expect(controller.createCustomerRequest(dto as never)).resolves.toEqual(
      expect.objectContaining({ id: "request-1" }),
    );

    expect(mockUsersService.createCustomerRequest).toHaveBeenCalledWith(dto);
  });

  it("allows the testing domain creation endpoint only in development", async () => {
    process.env.NODE_ENV = "development";
    const dto = {
      name: "Gallery Owner",
      email: "owner@example.com",
      proposedDomainName: "gallery.example",
    };

    await expect(
      controller.createDomainForTesting(dto as never),
    ).resolves.toBeUndefined();

    expect(mockDomainsService.createDomainWithAdmin).toHaveBeenCalledWith(dto);
  });

  it("rejects the testing domain creation endpoint outside development", async () => {
    process.env.NODE_ENV = "test";

    await expect(
      controller.createDomainForTesting({
        name: "Gallery Owner",
        email: "owner@example.com",
        proposedDomainName: "gallery.example",
      } as never),
    ).rejects.toThrow("This endpoint is disabled in production");

    expect(mockDomainsService.createDomainWithAdmin).not.toHaveBeenCalled();
  });

  it("rejects the testing endpoint when local development targets production data", async () => {
    process.env.NODE_ENV = "development";
    process.env.TASTEMATCHER_DATA_ENV = "prd";

    await expect(
      controller.createDomainForTesting({
        name: "Gallery Owner",
        email: "owner@example.com",
        proposedDomainName: "gallery.example",
      } as never),
    ).rejects.toThrow("This endpoint is disabled in production");

    expect(mockDomainsService.createDomainWithAdmin).not.toHaveBeenCalled();
  });
});
