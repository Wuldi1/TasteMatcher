// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: responsive (mobile + desktop), smooth, accessible (WCAG AA).
// -----------------------------------------------------------

import { useAuth } from '../../hooks/useAuth';
import { useUserStatsContext } from '../../contexts/UserStatsContext';
import { useProposalData } from '../../hooks/useProposalData';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, ThumbsUp, ThumbsDown, FileText, Sparkles, LayoutGrid } from 'lucide-react';
import './HomePage.css';
import { useEffect } from 'react';
import { User } from '@tastematcher/common';

/**
 * Redesigned Home Page as a dashboard.
 */
export function CustomerHomePage() {
    const { user, refreshUser } = useAuth();

    // Fetch user stats from context
    const { stats, answeredQuestions, totalQuestions } = useUserStatsContext();

    // Fetch proposal metadata
    const { hasSubmittedProposal, proposalMetadata } = useProposalData(user?.domainId, user?.id);

    const navigate = useNavigate();

    // Load existing questionnaire data if user has already completed or is editing
    useEffect(() => {
        // Refresh user data to get latest personalQuestionnaire from backend
        if (refreshUser && user) {
            refreshUser().then((freshUser: Partial<User>) => {
                // Redirect customers to onboarding only if they haven't started or are in progress
                // Users who skipped or completed can access the home page
                // When they manually navigate to /onboarding, they can edit their answers
                if (freshUser.onboardingStatus !== 'completed' && freshUser.onboardingStatus !== 'skipped') {
                    navigate('/onboarding', { replace: true });
                }
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Only run once on mount


    // Calculate onboarding progress
    const onboardingProgress = totalQuestions - answeredQuestions;

    if (!user) {
        return null;
    }

    return (
        <div className="home-page p-4 sm:p-6 md:p-8 space-y-8">
            {/* Welcome Header */}
            <header className="bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg p-6 shadow-md">
                <h1 className="text-3xl font-bold">Hello, {user.name}!</h1>
                { /* Domain name should be displayed here */}
                <p className="text-lg mt-2">Welcome to your <strong>gallery</strong>.</p>
            </header>

            {/* Journey Progress */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Your Journey</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Link to="/onboarding" className="bg-blue-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-blue-200">
                        <CheckCircle className="w-10 h-10 text-blue-500" />
                        {
                            user.onboardingStatus === 'completed' ? (
                                <>
                                    <h3 className="text-lg font-medium mt-2">Onboarding completed</h3>
                                    <p className="text-sm text-gray-600 text-center">You still have {onboardingProgress} questions left unanswered. Answer them to help us understand your taste better.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-medium mt-2">'Complete onboarding'</h3>
                                    <p className="text-sm text-gray-600 text-center">Answer questions to help us understand your taste better.</p>
                                </>
                            )
                        }
                    </Link>
                    <Link to="/catalog" className="bg-green-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-green-200">
                        <LayoutGrid className="w-10 h-10 text-green-500" />
                        <h3 className="text-lg font-medium mt-2">View Catalog</h3>
                        <p className="text-sm text-gray-600 text-center">Explore {stats?.totalArtworks || 0} artworks in the gallery. Like your favorites to help us tailor recommendations.</p>
                    </Link>
                    <Link to="/taster" className="bg-yellow-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-yellow-200">
                        <Sparkles className="w-10 h-10 text-yellow-500" />
                        {
                            stats?.totalSwiped >= 20 ? (
                                <>
                                    <h3 className="text-lg font-medium mt-2">Keep up Model training</h3>
                                    <p className="text-sm text-gray-600 text-center">The more you swipe, the better your model gets.</p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-medium mt-2">Train your Model</h3>
                                    <p className="text-sm text-gray-600 text-center">Swipe through artworks to refine your preferences. You need at least {20} artworks swiped to train your model effectively.</p>
                                </>
                            )
                        }
                    </Link>
                    {hasSubmittedProposal && (
                        <Link to="/buying-proposal" className="bg-purple-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-purple-200">
                            <FileText className="w-10 h-10 text-purple-500" />
                            <h3 className="text-lg font-medium mt-2">Review Proposal</h3>
                            <p className="text-sm text-gray-600 text-center">Check your personalized art basket. Accept, reject or modify your selections before finalizing your purchase.</p>
                        </Link>
                    )}
                </div>
            </section>

            {/* Aggregated Stats */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Your Stats</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <ThumbsUp className="w-10 h-10 text-green-500" />
                        <h3 className="text-lg font-medium mt-2">{stats?.totalLikes || 0}</h3>
                        <p className="text-sm text-gray-600">Artworks Liked</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <ThumbsDown className="w-10 h-10 text-red-500" />
                        <h3 className="text-lg font-medium mt-2">{stats?.totalDislikes || 0}</h3>
                        <p className="text-sm text-gray-600">Artworks Disliked</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <LayoutGrid className="w-10 h-10 text-blue-500" />
                        <h3 className="text-lg font-medium mt-2">{stats?.totalSwiped || 0}</h3>
                        <p className="text-sm text-gray-600">Total Swipes</p>
                    </div>
                </div>
                {proposalMetadata && (
                    <div className="bg-white rounded-lg shadow-md p-4">
                        <h3 className="text-lg font-medium">Proposal Status</h3>
                        <p className="text-sm text-gray-600 mt-2">Suggested Artworks: {proposalMetadata.suggestedArtworks}</p>
                        <p className="text-sm text-gray-600">Approved: {proposalMetadata.approved}</p>
                        <p className="text-sm text-gray-600">Rejected: {proposalMetadata.rejected}</p>
                        <p className="text-sm text-gray-600">Not Responded: {proposalMetadata.notResponded}</p>
                        <p className="text-sm text-gray-600">Last Updated: {proposalMetadata.lastUpdated ? new Date(proposalMetadata.lastUpdated).toLocaleString() : 'NaN'}</p>
                    </div>
                )}
            </section>
        </div>
    );
}
