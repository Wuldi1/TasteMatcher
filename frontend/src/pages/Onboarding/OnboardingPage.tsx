import { PersonalQuestionnaire } from "@tastematcher/common";
import { ArrowLeft, ArrowRight, CheckCircle, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../utils/api";
import { AppInlineLoader } from "../../components/Loading/AppLoadingState";
import "./OnboardingPage.css";

const BUDGET_CHOICES = [
  "Paintings",
  "Prints",
  "Sculptures",
  "Photographs",
] as const;

type InterestChoice = (typeof BUDGET_CHOICES)[number];

const ONBOARDING_STEPS = [
  "About you",
  "Art interests",
  "Your collection",
  "Inspiration",
] as const;

function isInterestChoice(value: string): value is InterestChoice {
  return (BUDGET_CHOICES as readonly string[]).includes(value);
}

export function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const derivedInitialStep = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const parsed = Number(params.get("step"));
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 4) {
      return parsed;
    }
    return 1;
  }, [location.search]);
  const [step, setStep] = useState(derivedInitialStep);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    kind: "error" | "success";
    text: string;
  } | null>(null);
  const [uploadingTarget, setUploadingTarget] = useState<
    "aesthetic" | "collection" | null
  >(null);

  const [formData, setFormData] = useState<PersonalQuestionnaire>({
    fullName: user?.name || "",
    emailAddress: user?.email || "",
    primaryResidence: "",
    collectingStatus: undefined,
    mostInterestedInBuying: undefined,
    aestheticAdmiration: {
      description: "",
      imageUrls: [],
    },
    personalCollection: {
      imageUrls: [],
    },
  });

  useEffect(() => {
    setStep(derivedInitialStep);
  }, [derivedInitialStep]);

  useEffect(() => {
    void refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.personalQuestionnaire) {
      setFormData((prev) => ({
        ...prev,
        ...user.personalQuestionnaire,
        fullName: user.personalQuestionnaire?.fullName || user?.name || "",
        emailAddress:
          user.personalQuestionnaire?.emailAddress || user?.email || "",
        primaryResidence:
          user.personalQuestionnaire?.primaryResidence ||
          user.personalQuestionnaire?.currentLocation ||
          "",
        mostInterestedInBuying:
          user.personalQuestionnaire?.mostInterestedInBuying ||
          (() => {
            const legacyValue = user.personalQuestionnaire
              ?.unlimitedBudgetPurchase as string | undefined;
            return legacyValue && isInterestChoice(legacyValue)
              ? legacyValue
              : undefined;
          })(),
        aestheticAdmiration: {
          description:
            user.personalQuestionnaire?.aestheticAdmiration?.description || "",
          imageUrls:
            user.personalQuestionnaire?.aestheticAdmiration?.imageUrls || [],
        },
        personalCollection: {
          imageUrls:
            user.personalQuestionnaire?.personalCollection?.imageUrls || [],
        },
      }));
    }
  }, [user]);

  const updateFormData = (updates: Partial<PersonalQuestionnaire>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
  };

  const updateAesthetic = (
    updates: Partial<{ description: string; imageUrls: string[] }>,
  ) => {
    setFormData((prev) => ({
      ...prev,
      aestheticAdmiration: {
        ...prev.aestheticAdmiration,
        ...updates,
      },
    }));
  };

  const handleNext = async () => {
    if (isSubmitting || uploadingTarget !== null) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await apiClient.updateQuestionnaire({ personalQuestionnaire: formData });
      if (step < 4) {
        setStep((current) => current + 1);
        setMessage({ kind: "success", text: "Your progress is saved." });
      } else {
        if ((formData.aestheticAdmiration?.imageUrls?.length ?? 0) > 0) {
          await apiClient.finalizePreferenceVectors();
        }
        if (user?.onboardingStatus !== "completed") {
          await apiClient.completeOnboarding();
        }
        await refreshUser();
        navigate("/taster");
      }
    } catch (error) {
      console.error("Failed to save progress", error);
      setMessage({
        kind: "error",
        text: "We couldn’t save your profile. Your answers are still here. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSkip = async () => {
    if (isSubmitting || uploadingTarget !== null) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      if (user?.onboardingStatus !== "completed") {
        await apiClient.skipOnboarding();
      }
      await refreshUser();
      navigate("/home");
    } catch (error) {
      console.error("Failed to skip onboarding", error);
      setMessage({
        kind: "error",
        text: "We couldn’t leave the profile right now. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: "aesthetic" | "collection",
  ) => {
    if (!e.target.files?.length) return;

    setUploadingTarget(target);
    setMessage(null);
    const file = e.target.files[0];

    try {
      await apiClient.vectorizePreferenceImage(file, {
        section: target,
      });
      // Refresh user to get the new image URL from backend
      const updatedUser = await refreshUser();

      if (target === "aesthetic") {
        const images =
          updatedUser?.personalQuestionnaire?.aestheticAdmiration?.imageUrls ||
          [];
        updateAesthetic({ imageUrls: images });
      } else {
        const images =
          updatedUser?.personalQuestionnaire?.personalCollection?.imageUrls ||
          [];
        updateFormData({
          personalCollection: {
            imageUrls: images,
          },
        });
      }
    } catch (error) {
      console.error("Failed to upload image", error);
      setMessage({
        kind: "error",
        text: "That image could not be uploaded. Choose another image or try again.",
      });
    } finally {
      setUploadingTarget(null);
      e.target.value = "";
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Basic Info</h2>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="onboarding-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="onboarding-name"
                  type="text"
                  value={formData.fullName || ""}
                  onChange={(e) => updateFormData({ fullName: e.target.value })}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email Address
                </label>
                <input
                  id="onboarding-email"
                  type="email"
                  value={formData.emailAddress || ""}
                  onChange={(e) =>
                    updateFormData({ emailAddress: e.target.value })
                  }
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="you@example.com"
                />
              </div>
              <div>
                <label
                  htmlFor="onboarding-residence"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Primary Residence
                </label>
                <input
                  id="onboarding-residence"
                  type="text"
                  value={formData.primaryResidence || ""}
                  onChange={(e) =>
                    updateFormData({ primaryResidence: e.target.value })
                  }
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="City, State/Province, Country"
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">About You</h2>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                What are you most interested in buying?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {BUDGET_CHOICES.map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={formData.mostInterestedInBuying === choice}
                    onClick={() =>
                      updateFormData({ mostInterestedInBuying: choice })
                    }
                    className={`p-4 border rounded-lg text-left transition-all ${
                      formData.mostInterestedInBuying === choice
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-200"
                        : "border-gray-200 hover:border-indigo-200 hover:bg-indigo-50"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-3 font-medium">
                      {choice}
                      {formData.mostInterestedInBuying === choice ? (
                        <CheckCircle className="h-5 w-5" aria-hidden="true" />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div id="collection-section" className="space-y-6" tabIndex={-1}>
            <h2 className="text-2xl font-bold text-gray-900">
              Your Relationship with Art
            </h2>
            <div className="space-y-4">
              <label className="block text-sm font-medium text-gray-700">
                Do you currently collect art?
              </label>
              <div className="flex gap-4">
                <button
                  type="button"
                  aria-pressed={formData.collectingStatus === "collector"}
                  onClick={() =>
                    updateFormData({
                      collectingStatus: "collector",
                    })
                  }
                  className={`px-6 py-3 border rounded-lg transition-all ${
                    formData.collectingStatus === "collector"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Yes
                </button>
                <button
                  type="button"
                  aria-pressed={formData.collectingStatus === "not_yet"}
                  onClick={() =>
                    updateFormData({
                      collectingStatus: "not_yet",
                    })
                  }
                  className={`px-6 py-3 border rounded-lg transition-all ${
                    formData.collectingStatus === "not_yet"
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-medium"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Not yet
                </button>
              </div>
              {formData.collectingStatus === "collector" && (
                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    If yes, upload photos of the works (optional)
                  </label>
                  <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors relative">
                    <div className="space-y-1 text-center">
                      {uploadingTarget === "collection" ? (
                        <span className="mx-auto inline-flex">
                          <AppInlineLoader size="lg" />
                        </span>
                      ) : (
                        <Upload className="mx-auto h-12 w-12 text-gray-400" />
                      )}
                      <div className="flex text-sm text-gray-600">
                        <label className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                          <span>Upload a file</span>
                          <input
                            type="file"
                            className="sr-only"
                            accept="image/*"
                            onChange={(event) =>
                              handleImageUpload(event, "collection")
                            }
                            disabled={uploadingTarget !== null}
                          />
                        </label>
                        <p className="pl-1">from your device</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        PNG, JPG, GIF up to 10MB
                      </p>
                    </div>
                  </div>
                  {formData.personalCollection?.imageUrls &&
                    formData.personalCollection.imageUrls.length > 0 && (
                      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {formData.personalCollection.imageUrls.map(
                          (url, idx) => (
                            <div
                              key={idx}
                              className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                            >
                              <img
                                src={url}
                                alt={`Collection upload ${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ),
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">
              Aesthetic References
            </h2>
            <div className="space-y-4">
              <label
                htmlFor="aesthetic-description"
                className="block text-sm font-medium text-gray-700"
              >
                Are there any artists or designers you admire? Upload
                screenshots or photos if helpful.
              </label>
              <textarea
                id="aesthetic-description"
                value={formData.aestheticAdmiration?.description || ""}
                onChange={(e) =>
                  updateAesthetic({ description: e.target.value })
                }
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                rows={4}
                placeholder="Artists, movements, color palettes, or moods you love..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload aesthetic references (optional)
              </label>
              <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors relative">
                <div className="space-y-1 text-center">
                  {uploadingTarget === "aesthetic" ? (
                    <span className="mx-auto inline-flex">
                      <AppInlineLoader size="lg" />
                    </span>
                  ) : (
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  )}
                  <div className="flex text-sm text-gray-600">
                    <label className="relative cursor-pointer bg-white rounded-md font-medium text-indigo-600 hover:text-indigo-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500">
                      <span>Upload a file</span>
                      <input
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={(event) =>
                          handleImageUpload(event, "aesthetic")
                        }
                        disabled={uploadingTarget !== null}
                      />
                    </label>
                    <p className="pl-1">from your device</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    PNG, JPG, GIF up to 10MB
                  </p>
                </div>
              </div>
              {formData.aestheticAdmiration?.imageUrls &&
                formData.aestheticAdmiration.imageUrls.length > 0 && (
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {formData.aestheticAdmiration.imageUrls.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-lg overflow-hidden bg-gray-100"
                      >
                        <img
                          src={url}
                          alt={`Upload ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="onboarding-shell min-h-screen bg-gradient-to-b from-purple-50 via-white to-purple-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <header className="onboarding-shell__header">
          <p>Your private profile</p>
          <h1>
            {user?.onboardingStatus === "completed"
              ? "Refine your taste profile."
              : "Your eye. Your story."}
          </h1>
          <span>
            {user?.onboardingStatus === "completed"
              ? "Review or update the context shared with your art advisor."
              : "A considered introduction helps us understand what moves you."}
          </span>
        </header>
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className="h-2 bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          <div className="onboarding-step-label mt-2 text-sm text-gray-500">
            <span>{ONBOARDING_STEPS[step - 1]}</span>
            <span>Step {step} of 4</span>
          </div>
        </div>

        <ol className="onboarding-stepper" aria-label="Taste profile progress">
          {ONBOARDING_STEPS.map((label, index) => (
            <li
              key={label}
              aria-current={index + 1 === step ? "step" : undefined}
              data-complete={index + 1 < step ? "true" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {label}
            </li>
          ))}
        </ol>

        {/* Content Card */}
        <div className="onboarding-card bg-white shadow-sm rounded-xl p-6 sm:p-8">
          {renderStep()}

          {message ? (
            <div
              className={`onboarding-message onboarding-message--${message.kind}`}
              role={message.kind === "error" ? "alert" : "status"}
              aria-live="polite"
            >
              {message.text}
            </div>
          ) : null}

          <div className="onboarding-actions mt-8 flex justify-between pt-6 border-t border-gray-100">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1 || isSubmitting}
              className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                step === 1
                  ? "text-gray-300 cursor-not-allowed"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>

            <div className="onboarding-actions__primary flex items-center gap-3">
              <button
                type="button"
                onClick={handleNext}
                disabled={isSubmitting || uploadingTarget !== null}
                className="flex items-center px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <AppInlineLoader label="Saving" size="xs" theme="light" />
                ) : step === 4 ? (
                  <>
                    {user?.onboardingStatus === "completed"
                      ? "Save profile"
                      : "Start discovering"}
                    <CheckCircle className="w-4 h-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSubmitting || uploadingTarget !== null}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                {user?.onboardingStatus === "completed"
                  ? "Return home"
                  : "Skip for now"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
