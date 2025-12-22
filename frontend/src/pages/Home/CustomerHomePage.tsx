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

import { useAuth } from '../../contexts/AuthContext';
import { useProposalData } from '../../hooks/useProposalData';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, ThumbsUp, ThumbsDown, FileText, Sparkles, MessageSquare, Send, Paperclip, Loader2, Image as ImageIcon, Upload } from 'lucide-react';
import './HomePage.css';
import { useEffect, useState, useRef } from 'react';
import { apiClient } from '../../utils/api';

/**
 * Redesigned Home Page as a dashboard.
 */
export function CustomerHomePage() {
    const { user, refreshUser, stats, answeredQuestions, totalQuestions } = useAuth();
    const [newComment, setNewComment] = useState('');
    const [isSendingComment, setIsSendingComment] = useState(false);
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const commentsEndRef = useRef<HTMLDivElement>(null);

    // Fetch proposal metadata
    const { hasSubmittedProposal, proposalMetadata, loading } = useProposalData(user?.domainId, user?.id);

    const navigate = useNavigate();

    // Load existing questionnaire data if user has already completed or is editing
    useEffect(() => {
        // Refresh user data to get latest personalQuestionnaire from backend
        if (refreshUser && user) {
            refreshUser().then((freshUser) => {
                if (!freshUser) {
                    return;
                }
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

    // Scroll to bottom of comments when they change
    useEffect(() => {
        if (user?.comments?.length) {
            commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [user?.comments]);

    const handleSendComment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newComment.trim() || !user?.id) return;

        setIsSendingComment(true);
        try {
            await apiClient.addUserComment(user.id, newComment);
            setNewComment('');
            await refreshUser();
        } catch (error) {
            console.error('Failed to send comment', error);
        } finally {
            setIsSendingComment(false);
        }
    };

    const uploadAttachment = async (file: File) => {
        if (!user?.id) return;
        const previousUrls = user.sharedCollectionUploads ?? [];
        setIsUploadingAttachment(true);
        try {
            await apiClient.vectorizePreferenceImage(file, { section: 'shared_gallery' });
            const updatedUser = await refreshUser();
            const newUrls = updatedUser?.sharedCollectionUploads ?? [];
            const attachmentUrl =
                newUrls.find((url) => !previousUrls.includes(url)) || newUrls[newUrls.length - 1];

            if (attachmentUrl) {
                await apiClient.addUserComment(user.id, attachmentUrl);
                await refreshUser();
            }
        } catch (error) {
            console.error('Failed to upload attachment', error);
        } finally {
            setIsUploadingAttachment(false);
        }
    };

    const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            void uploadAttachment(file);
        }
        event.target.value = '';
    };

    const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
        if (event.clipboardData.files.length > 0) {
            const file = event.clipboardData.files[0];
            event.preventDefault();
            void uploadAttachment(file);
        }
    };

    // Calculate onboarding progress
    const remainingQuestions = Math.max(totalQuestions - answeredQuestions, 0);

    if (!user || loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
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
                                    <p className="text-sm text-gray-600 text-center">
                                        {remainingQuestions > 0
                                            ? `You still have ${remainingQuestions} questions left unanswered. Add more details anytime.`
                                            : 'Thanks for keeping your taste profile up to date.'}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <h3 className="text-lg font-medium mt-2">'Complete onboarding'</h3>
                                    <p className="text-sm text-gray-600 text-center">Answer questions to help us understand your taste better.</p>
                                </>
                            )
                        }
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
                    <Link
                        to={{ pathname: '/onboarding', search: '?step=7', hash: '#collection-section' }}
                        className="bg-pink-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-pink-200"
                    >
                        <Upload className="w-10 h-10 text-pink-600" />
                        <h3 className="text-lg font-medium mt-2 text-center">Share Your Collection</h3>
                        <p className="text-sm text-gray-600 text-center">
                            Upload inspiration shots or current pieces so our team can curate more precisely.
                        </p>
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
                <h2 className="text-xl font-semibold">Your Profile Section</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <Link
                        to="/catalog?view=liked"
                        className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                        <ThumbsUp className="w-10 h-10 text-green-500" />
                        <h3 className="text-lg font-medium mt-2">{stats?.totalLikes || 0}</h3>
                        <p className="text-sm text-gray-600">Artworks Liked</p>
                        <span className="mt-2 text-xs text-blue-500">View saved likes →</span>
                    </Link>
                    <Link
                        to="/catalog?view=disliked"
                        className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center hover:shadow-lg transition-shadow focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                        <ThumbsDown className="w-10 h-10 text-red-500" />
                        <h3 className="text-lg font-medium mt-2">{stats?.totalDislikes || 0}</h3>
                        <p className="text-sm text-gray-600">Artworks Disliked</p>
                        <span className="mt-2 text-xs text-blue-500">Review dislikes →</span>
                    </Link>
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <Sparkles className="w-10 h-10 text-yellow-500" />
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

            {(user.sharedCollectionUploads?.length ?? 0) > 0 && (
                <section className="space-y-6">
                    <div className="flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-blue-500" />
                        <h2 className="text-xl font-semibold">Shared Gallery</h2>
                    </div>
                    <p className="text-sm text-gray-500">
                        These are the reference photos you have shared with your specialist so far. Upload more anytime from the chat or questionnaire.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {user.sharedCollectionUploads?.map((url, idx) => (
                            <a
                                key={url + idx}
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="group block rounded-xl overflow-hidden border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow"
                                title="Open full image"
                            >
                                <div className="aspect-square overflow-hidden bg-gray-100">
                                    <img
                                        src={url}
                                        alt={`Shared upload ${idx + 1}`}
                                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        loading="lazy"
                                    />
                                </div>
                                <div className="px-3 py-2 text-xs text-gray-500 flex items-center justify-between">
                                    <span>Upload #{idx + 1}</span>
                                    <span className="text-[10px] uppercase tracking-wide">View</span>
                                </div>
                            </a>
                        ))}
                    </div>
                </section>
            )}

            {/* Chat with Specialist */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Contact Specialist</h2>
                <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-[500px]">
                    <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-blue-500" />
                        <span className="font-medium text-gray-700">Messages</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/30">
                        {(!user.comments || user.comments.length === 0) ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                                <p>No messages yet. Start a conversation!</p>
                            </div>
                        ) : (
                            user.comments.map((comment, idx) => {
                                const isMe = comment.author === user.name || comment.author === user.email;
                                const trimmedText = comment.text?.trim() || '';
                                const isImageMessage = /^https?:\/\//i.test(trimmedText);
                                return (
                                    <div key={idx} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                                            isMe 
                                                ? 'bg-blue-600 text-white rounded-br-none' 
                                                : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none shadow-sm'
                                        }`}>
                                            <div className={`text-xs mb-1 ${isMe ? 'text-blue-100' : 'text-gray-500'}`}>
                                                {isMe ? 'You' : comment.author} • {new Date(comment.createdAt).toLocaleDateString()}
                                            </div>
                                            {isImageMessage ? (
                                                <a
                                                    href={trimmedText}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="block"
                                                >
                                                    <div className={`rounded-xl overflow-hidden border ${isMe ? 'border-white/30 bg-white/10' : 'border-gray-200 bg-gray-50'}`}>
                                                        <img
                                                            src={trimmedText}
                                                            alt="Shared attachment"
                                                            className="w-full max-w-[220px] h-36 object-cover"
                                                        />
                                                    </div>
                                                    <span className={`mt-1 block text-[10px] uppercase tracking-wide ${isMe ? 'text-blue-100' : 'text-gray-400'}`}>
                                                        Tap to open full size
                                                    </span>
                                                </a>
                                            ) : (
                                                <p className="text-sm whitespace-pre-wrap break-words">{comment.text}</p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={commentsEndRef} />
                    </div>

                    <div className="p-4 bg-white border-t border-gray-100">
                        <form onSubmit={handleSendComment} className="flex gap-2 items-center">
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                ref={fileInputRef}
                                className="hidden"
                                onChange={handleFileInputChange}
                            />
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="text-gray-500 hover:text-blue-600 transition-colors p-2 rounded-full hover:bg-blue-50"
                                title="Attach an image"
                                disabled={isSendingComment || isUploadingAttachment}
                            >
                                <Paperclip className="w-5 h-5" />
                            </button>
                            <input
                                type="text"
                                value={newComment}
                                onChange={(e) => setNewComment(e.target.value)}
                                placeholder="Type a message..."
                                className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                disabled={isSendingComment || isUploadingAttachment}
                                onPaste={handlePaste}
                            />
                            <button
                                type="submit"
                                disabled={!newComment.trim() || isSendingComment || isUploadingAttachment}
                                className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSendingComment ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </button>
                            {isUploadingAttachment && (
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                                </span>
                            )}
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
}
