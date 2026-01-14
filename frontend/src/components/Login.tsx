import React, { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { apiClient, ApiError } from "../utils/api";

type Phase =
  | "email"
  | "code-entry"
  | "user-not-found"
  | "buyer-info"
  | "seller-form"
  | "seller-success";
type UserIntent = "buy" | "sell" | null;

/**
 * Login component with email verification
 * Handles existing users and provides options for new users
 */
export function Login() {
  const navigate = useNavigate();
  const { setUserFromUser } = useAuth();

  const [email, setEmail] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>(
    window.location.hostname.includes("tastematcher.art") ? "" : "000000",
  );
  const [phase, setPhase] = useState<Phase>("email");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [userIntent, setUserIntent] = useState<UserIntent>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seller form state
  const [sellerName, setSellerName] = useState("");
  const [sellerDomainName, setSellerDomainName] = useState("");
  const [sellerMessage, setSellerMessage] = useState("");
  const logoSrc = `${process.env.PUBLIC_URL}/tastematcher_icon_icon_128.png`;

  const handleEmailSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!email.trim()) {
        setError("Email is required");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await apiClient.requestLoginCode(email.trim().toLowerCase());
        setPhase("code-entry");
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          // User doesn't exist
          setPhase("user-not-found");
        } else {
          console.error("Failed to request login code:", err);
          setError(
            err instanceof ApiError
              ? err.message
              : "Failed to send verification code",
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [email],
  );

  const handleCodeSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (verificationCode.trim().length !== 6) {
        setError("Please enter the 6-digit code");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await apiClient.verifyLoginCode(
          email.trim().toLowerCase(),
          verificationCode.trim(),
        );

        // Store token
        localStorage.setItem("token", result.token);
        localStorage.setItem("tm_auth_token", result.token);

        // Update auth context
        setUserFromUser(result.user);

        // Configure API client
        apiClient.setAuthToken(result.token);

        // Navigate to home
        navigate("/home");
      } catch (err) {
        console.error("Failed to verify code:", err);
        setError(err instanceof ApiError ? err.message : "Verification failed");
      } finally {
        setIsLoading(false);
      }
    },
    [email, verificationCode, navigate, setUserFromUser],
  );

  const handleResendCode = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      await apiClient.requestLoginCode(email.trim().toLowerCase());
      setError(null);
    } catch (err) {
      console.error("Failed to resend code:", err);
      setError("Could not resend code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [email]);

  const handleSellerFormSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!sellerName.trim() || !sellerDomainName.trim()) {
        setError("Name and domain name are required");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        await apiClient.createDomainRequest({
          name: sellerName.trim(),
          email: email.trim().toLowerCase(),
          proposedDomainName: sellerDomainName.trim(),
          message: sellerMessage.trim(),
        });

        // Show success phase instead of alert
        setPhase("seller-success");
      } catch (err) {
        console.error("Failed to submit domain request:", err);
        setError(
          err instanceof ApiError ? err.message : "Failed to submit request",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [email, sellerName, sellerDomainName, sellerMessage],
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 sm:p-8 w-full max-w-md">
        <div className="flex justify-center mb-4">
          <img src={logoSrc} alt="TasteMatcher logo" className="h-12 w-12" />
        </div>
        <div className="text-center mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            TasteMatcher
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            {phase === "email" && "Sign in to your account"}
            {phase === "code-entry" && "Enter verification code"}
            {phase === "user-not-found" && "Welcome to TasteMatcher"}
            {phase === "buyer-info" && "Connect with Galleries"}
            {phase === "seller-form" && "Request Your Gallery Account"}
            {phase === "seller-success" && "Request Submitted!"}
          </p>
        </div>

        {/* Email Phase */}
        {phase === "email" && (
          <form onSubmit={handleEmailSubmit} className="space-y-6">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="you@example.com"
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400"
            >
              {isLoading ? "Sending..." : "Continue"}
            </button>
          </form>
        )}

        {/* Code Entry Phase */}
        {phase === "code-entry" && (
          <form onSubmit={handleCodeSubmit} className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">
              We sent a verification code to <strong>{email}</strong>. Please
              enter it below.
            </p>

            <div>
              <label
                htmlFor="code"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Verification Code
              </label>
              <input
                id="code"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="000000"
                maxLength={6}
                disabled={isLoading}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400"
            >
              {isLoading ? "Verifying..." : "Verify Code"}
            </button>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-center">
              <button
                type="button"
                onClick={handleResendCode}
                disabled={isLoading}
                className="flex-1 text-blue-600 hover:text-blue-800 disabled:text-gray-400 text-sm"
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("email");
                  setVerificationCode("");
                  setError(null);
                }}
                disabled={isLoading}
                className="flex-1 text-gray-600 hover:text-gray-800 disabled:text-gray-400 text-sm"
              >
                Change email
              </button>
            </div>
          </form>
        )}

        {/* User Not Found Phase */}
        {phase === "user-not-found" && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                We don't recognize this email address. Are you looking to buy or
                sell art?
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setPhase("buyer-info")}
                className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white"
              >
                I want to buy art
              </button>
              <button
                onClick={() => setPhase("seller-form")}
                className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-white hover:bg-gray-50 text-blue-600 border-2 border-blue-600"
              >
                I want to sell art (gallery/dealer)
              </button>
            </div>

            <button
              onClick={() => {
                setPhase("email");
                setEmail("");
                setError(null);
              }}
              className="w-full text-gray-600 hover:text-gray-800 text-sm"
            >
              ← Back to login
            </button>
          </div>
        )}

        {/* Buyer Info Phase */}
        {phase === "buyer-info" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Connect with Art Galleries
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                TasteMatcher helps art buyers discover pieces that match their
                taste through our network of galleries.
              </p>
              <p className="text-sm text-gray-700 mb-4">
                To get started, please send us an email with:
              </p>
              <ul className="text-sm text-gray-700 mb-4 list-disc list-inside space-y-1">
                <li>Your name and location</li>
                <li>The type of art you're interested in</li>
                <li>Your budget range</li>
              </ul>
              <div className="bg-white rounded-lg p-4 border border-blue-300">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Contact us at:
                </p>
                <a
                  href="mailto:admin@tastematcher.com"
                  className="text-lg font-semibold text-blue-600 hover:text-blue-800"
                >
                  admin@tastematcher.com
                </a>
              </div>
            </div>

            <button
              onClick={() => {
                setPhase("email");
                setEmail("");
                setUserIntent(null);
                setError(null);
              }}
              className="w-full text-gray-600 hover:text-gray-800 text-sm"
            >
              ← Back to login
            </button>
          </div>
        )}

        {/* Seller Form Phase */}
        {phase === "seller-form" && (
          <form onSubmit={handleSellerFormSubmit} className="space-y-4">
            <p className="text-sm text-gray-600 mb-4">
              Please provide your details and we'll set up your gallery account.
            </p>

            <div>
              <label
                htmlFor="sellerName"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Your Name
              </label>
              <input
                id="sellerName"
                type="text"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Doe"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label
                htmlFor="sellerDomainName"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Gallery Name
              </label>
              <input
                id="sellerDomainName"
                type="text"
                value={sellerDomainName}
                onChange={(e) => setSellerDomainName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="My Art Gallery"
                disabled={isLoading}
                required
              />
            </div>

            <div>
              <label
                htmlFor="sellerMessage"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Additional Information (Optional)
              </label>
              <textarea
                id="sellerMessage"
                value={sellerMessage}
                onChange={(e) => setSellerMessage(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Tell us about your gallery, location, or any special requirements..."
                rows={4}
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-400"
              >
                {isLoading ? "Submitting..." : "Submit Request"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase("user-not-found");
                  setSellerName("");
                  setSellerDomainName("");
                  setSellerMessage("");
                  setError(null);
                }}
                disabled={isLoading}
                className="w-full text-gray-600 hover:text-gray-800 text-sm"
              >
                ← Back
              </button>
            </div>
          </form>
        )}

        {/* Seller Success Phase */}
        {phase === "seller-success" && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-green-100 rounded-full p-3">
                  <svg
                    className="w-8 h-8 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-semibold text-gray-900 text-center mb-3">
                Request Submitted!
              </h3>

              <p className="text-sm text-gray-700 text-center mb-4">
                Thank you for your interest in TasteMatcher. We've received your
                gallery account request.
              </p>

              <div className="bg-white rounded-lg p-4 border border-green-200 space-y-2">
                <p className="text-sm text-gray-700">
                  <span className="font-medium">What's next?</span>
                </p>
                <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
                  <li>We'll review your request within 1-2 business days</li>
                  <li>
                    You'll receive an email at{" "}
                    <strong className="text-gray-900">{email}</strong> with next
                    steps
                  </li>
                  <li>
                    Once approved, you'll be able to log in and start uploading
                    your collection
                  </li>
                </ul>
              </div>

              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-gray-700 mb-1">
                  Need help?
                </p>
                <p className="text-sm text-gray-600">
                  Contact us at{" "}
                  <a
                    href="mailto:admin@tastematcher.com"
                    className="text-blue-600 hover:text-blue-800 font-medium"
                  >
                    admin@tastematcher.com
                  </a>
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                setPhase("email");
                setEmail("");
                setSellerName("");
                setSellerDomainName("");
                setSellerMessage("");
                setUserIntent(null);
                setError(null);
              }}
              className="w-full py-3 px-4 rounded-lg font-medium transition-colors bg-blue-600 hover:bg-blue-700 text-white"
            >
              Back to Login
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs sm:text-sm text-gray-500">
            By continuing, you agree to our terms of service
          </p>
        </div>
      </div>
    </div>
  );
}
