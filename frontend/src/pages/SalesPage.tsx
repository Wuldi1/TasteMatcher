// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// -----------------------------------------------------------
import { useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import SaleProposal from '../components/SaleProposal';
import { useAuth } from '../contexts/AuthContext';
import { ArtworkStats, Proposal, ProposalItem, User, Artwork } from '@tastematcher/common';
import { AISuggestionsPage } from './AISuggestions/AISuggestionsPage';
import CatalogForUser from '../components/Catalog/CatalogForUser';

type UserItem = { id: string; name?: string };

export default function SalesPage() {
    const { user } = useAuth();
    const domainId = user?.domainId ?? 'default';
    const isGlobalAdmin = user?.role === 'global_admin';
    // Domains (only used for global_admin)
    const [domains, setDomains] = useState<{ id: string; name?: string; adminEmail?: string }[]>([]);
    const [selectedDomainId, setSelectedDomainId] = useState<string | undefined>(isGlobalAdmin ? undefined : domainId);
    const [domainsLoading, setDomainsLoading] = useState<boolean>(false);

    // Effective domain used for domain-scoped APIs in this page:
    // - global_admin: use selectedDomainId (must choose a domain)
    // - domain_owner / dealer: use their own domainId (no special domain dropdown)
    const effectiveDomainId = isGlobalAdmin ? selectedDomainId : domainId;

    const [users, setUsers] = useState<UserItem[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string | undefined>(undefined);
    const [activeTab, setActiveTab] = useState<'details' | 'catalog' | 'ai' | 'proposal'>('details');
    const [hasFeedbackFilter, setHasFeedbackFilter] = useState<boolean>(false);

    // New: fetched user details + stats
    const [userDetails, setUserDetails] = useState<User | null>(null);
    const [userDetailsLoading, setUserDetailsLoading] = useState(false);
    const [userDetailsError, setUserDetailsError] = useState<string | null>(null);

    const [stats, setStats] = useState<ArtworkStats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState<string | null>(null);

    // New: proposal draft state
    const [proposalItem, setProposalItem] = useState<ProposalItem[]>([]);
    const [proposalDetails, setProposalDetails] = useState<Proposal | null>(null); // Store proposal metadata

    // Load the correct proposal for the selected user
    useEffect(() => {
        if (!effectiveDomainId || !selectedUserId) {
            setProposalDetails(null);
            setProposalItem([]);
            return;
        }

        (async () => {
            try {
                const proposals = await apiClient.listProposals(effectiveDomainId, selectedUserId);
                if (proposals.length > 0) {
                    const proposal = proposals.find((p) => p.userId === selectedUserId); // Find the proposal for the selected user
                    if (proposal) {
                        setProposalDetails(proposal);
                        setProposalItem(
                            proposal.items.map((item) => ({
                                artworkId: item.artworkId,
                                comments: item.comments ?? [],
                                status: item.status ?? 'pending'
                            }))
                        );
                    } else {
                        setProposalDetails(null);
                        setProposalItem([]);
                    }
                } else {
                    setProposalDetails(null);
                    setProposalItem([]);
                }
            } catch (err) {
                console.error('Failed to load proposals', err);
                setProposalDetails(null);
                setProposalItem([]);
            }
        })();
    }, [effectiveDomainId, selectedUserId]);

    useEffect(() => {
        if (!isGlobalAdmin) return;
        setDomainsLoading(true);
        (async () => {
            try {
                const domainsResponse = await apiClient.getAllDomains();
                setDomains(domainsResponse.map(domain => ({ id: domain.id, name: domain.name, adminEmail: domain.adminEmail })));
                // if none selected, default to first
                if (!selectedDomainId && domainsResponse.length > 0) {
                    setSelectedDomainId(domainsResponse[0].id);
                }
            } catch (err) {
                console.error('Failed to load domains for sales page', err);
                setDomains([]);
            } finally {
                setDomainsLoading(false);
            }
        })();
    }, [isGlobalAdmin, selectedDomainId]);

    // Load users:
    // - global_admin: require selectedDomainId and call /api/users/domain/:domainId
    // - others: call /api/users (server infers domain from JWT)
    useEffect(() => {
        (async () => {
            try {
                if (isGlobalAdmin) {
                    if (!selectedDomainId) {
                        setUsers([]);
                        return;
                    }
                    const usersResponse = await apiClient.getAllUsers(selectedDomainId);
                    setUsers(
                        usersResponse
                            .filter((userItem) => userItem.role === 'customer') // Filter only customers
                            .map((userItem) => ({ id: userItem.id, name: userItem.name ?? userItem.email }))
                    );
                } else {
                    // domain_owner / dealer: call without domainId so backend uses caller's domain
                    const usersResponse = await apiClient.getAllUsers();
                    setUsers(
                        usersResponse
                            .filter((userItem) => userItem.role === 'customer') // Filter only customers
                            .map((userItem) => ({ id: userItem.id, name: userItem.name ?? userItem.email }))
                    );
                }
            } catch (err) {
                console.error('Failed to load users for sales page', err);
                setUsers([]);
            }
        })();
    }, [isGlobalAdmin, selectedDomainId, domainId]);

    // Clear selected user and proposal draft when domain selection changes (prevent cross-domain drafts)
    useEffect(() => {
        setSelectedUserId(undefined);
        setProposalItem([]);
    }, [selectedDomainId]);

    // Fetch selected user details and domain stats when selection changes
    useEffect(() => {
        if (!selectedUserId) {
            setUserDetails(null);
            setUserDetailsError(null);
            return;
        }

        (async () => {
            setUserDetailsLoading(true);
            setUserDetailsError(null);
            try {
                // If current viewer is global admin and an effectiveDomainId is selected, include it so backend fetches that domain's user
                const domainToRequest = isGlobalAdmin ? selectedDomainId : undefined;
                const userResponse = await apiClient.getUser(selectedUserId, domainToRequest);
                setUserDetails(userResponse);
            } catch (err) {
                console.error('Failed to load user details', err);
                setUserDetailsError('Unable to load user details');
                setUserDetails(null);
            } finally {
                setUserDetailsLoading(false);
            }
        })();
        // include domain selection and admin flag (primitives) so effect re-runs only when they change
    }, [selectedUserId, isGlobalAdmin, selectedDomainId]);

    useEffect(() => {
        // Use effectiveDomainId (selectedDomainId for admins, user's domain otherwise)
        if (!effectiveDomainId) {
            setStats(null);
            setStatsError(null);
            return;
        }
        (async () => {
            setStatsLoading(true);
            setStatsError(null);
            try {
                const statsResponse = await apiClient.getArtworkStats(effectiveDomainId);
                setStats(statsResponse);
            } catch (err) {
                console.error('Failed to load artwork stats', err);
                setStatsError('Unable to load stats');
                setStats(null);
            } finally {
                setStatsLoading(false);
            }
        })();
    }, [effectiveDomainId]);

    // Helper: render onboarding answers in readable form
    function renderQuestionnaire(q: Record<string, unknown>) {
        // Render as sections if nested, otherwise key/value rows
        return Object.entries(q).map(([k, v]) => {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
                const section = v as Record<string, unknown>;
                return (
                    <div key={k} className="mb-4">
                        <h4 className="text-sm font-semibold mb-2">{humanize(k)}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Object.entries(section).map(([sk, sv]) => (
                                <div key={sk} className="text-sm">
                                    <div className="text-xs text-gray-500">{humanize(sk)}</div>
                                    <div className="text-sm text-gray-800">{formatValue(sv)}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            }

            // primitive or array
            return (
                <div key={k} className="mb-3">
                    <div className="text-xs text-gray-500">{humanize(k)}</div>
                    <div className="text-sm text-gray-800">{formatValue(v)}</div>
                </div>
            );
        });
    }

    function humanize(key: string) {
        return key
            .replace(/([A-Z])/g, ' $1')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }

    function formatValue(v: unknown) {
        if (v == null) return '-';
        if (Array.isArray(v)) return v.join(', ');
        if (typeof v === 'object') return JSON.stringify(v);
        return String(v);
    }

    // Proposal items as artwork IDs for easy lookup
    const proposalArtworkIds = proposalItem.map((item) => item.artworkId);

    // Add/remove artwork from proposal
    const handleProposalToggle = (artwork: Artwork) => {
        setProposalItem((currentDraft) => {
            const isAlreadyInProposal = currentDraft.some(
                (draftItem) => draftItem.artworkId === artwork.id
            );
            if (isAlreadyInProposal) {
                // Remove from proposal
                return currentDraft.filter((draftItem) => draftItem.artworkId !== artwork.id);
            } else {
                // Add to proposal
                return [
                    {
                        artworkId: artwork.id,
                        comments: [],
                        status: 'pending',
                        taggedAt: Date.now(),
                        title: artwork.title,
                        filename: artwork.filename,
                    },
                    ...currentDraft,
                ];
            }
        });
    };

    // --- New styled tab bar and enhanced Details panel UI ---
    return (
        <div className="p-6">
            <header className="mb-6">
                <h1 className="text-3xl font-semibold">Sales</h1>
                <p className="text-sm text-gray-500 mt-1">Select a user to create sale proposals, browse catalog and view AI suggestions.</p>
            </header>

            <div className="mb-4">
                {/* If global admin, allow choosing domain first */}
                {isGlobalAdmin && (
                    <div className="mb-4">
                        <label htmlFor="sales-domain" className="block text-sm font-medium text-gray-700">Select domain</label>
                        <select
                            id="sales-domain"
                            aria-label="Select domain"
                            value={selectedDomainId ?? ''}
                            onChange={(e) => setSelectedDomainId(e.target.value || undefined)}
                            className="mt-1 block w-full max-w-sm rounded-md border-gray-300 shadow-sm"
                        >
                            <option value="">-- choose domain --</option>
                            {domainsLoading ? <option>Loading...</option> : domains.map((d) => (
                                <option key={d.id} value={d.id}>{d.name ?? d.adminEmail ?? d.id}</option>
                            ))}
                        </select>
                    </div>
                )}

                <label htmlFor="sales-user" className="block text-sm font-medium text-gray-700">Select user</label>
                <select
                    id="sales-user"
                    aria-label="Select user"
                    value={selectedUserId ?? ''}
                    onChange={(e) => setSelectedUserId(e.target.value || undefined)}
                    className="mt-1 block w-full max-w-sm rounded-md border-gray-300 shadow-sm"
                >
                    <option value="">-- choose user --</option>
                    {users.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.id}</option>
                    ))}
                </select>
            </div>

            {/* Tab bar */}
            <div className="mb-4">
                <div className="bg-gray-100 rounded-lg p-1 shadow-sm">
                    <div className="flex space-x-1">
                        {[
                            { id: 'details', label: 'Details' },
                            { id: 'catalog', label: 'Catalog' },
                            { id: 'ai', label: 'AI Suggestions' },
                            { id: 'proposal', label: 'Sale Proposal' },
                        ].map((t) => {
                            const active = activeTab === (t.id as any);
                            return (
                                <button
                                    key={t.id}
                                    role="tab"
                                    aria-selected={active}
                                    aria-controls={`panel-${t.id}`}
                                    id={`tab-${t.id}`}
                                    onClick={() => setActiveTab(t.id as any)}
                                    className={`flex-1 text-sm px-4 py-2 focus:outline-none transition flex items-center gap-3 ${active
                                        ? 'bg-blue-50 text-blue-600 border-l-4 border-blue-500 rounded-lg shadow-sm'
                                        : 'text-gray-600 hover:text-gray-900 bg-transparent'
                                        }`}
                                >
                                    {/* Left icon / accent area visual alignment preserved by flex */}
                                    <span className="truncate">{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="mt-4 bg-white p-6 rounded-b-lg border shadow-sm">
                    {/* Details Panel */}
                    <div
                        role="tabpanel"
                        id="panel-details"
                        aria-labelledby="tab-details"
                        hidden={activeTab !== 'details'}
                    >
                        {!selectedUserId && <div className="text-sm text-gray-600">Please select a user to view details.</div>}

                        {selectedUserId && userDetailsLoading && <div className="text-sm text-gray-600">Loading user...</div>}

                        {selectedUserId && userDetailsError && <div className="text-sm text-red-600">{userDetailsError}</div>}

                        {selectedUserId && userDetails && (
                            <div className="space-y-6">
                                {/* User header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl font-semibold text-blue-600">
                                            {userDetails.name ? userDetails.name.split(' ').map(n => n[0]).slice(0, 2).join('') : (userDetails.email?.[0] ?? 'U')}
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-semibold">{userDetails.name ?? userDetails.email}</h2>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-sm text-gray-500">{userDetails.email}</span>
                                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800 capitalize">{userDetails.role}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Sections: Details | Onboarding Answers | Artwork Stats */}
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Details card */}
                                    <div className="col-span-1 lg:col-span-1 bg-gray-50 p-4 rounded shadow-inner">
                                        <h3 className="text-sm font-semibold mb-3">Details</h3>
                                        <div className="text-sm text-gray-800 space-y-3">
                                            <div>
                                                <div className="text-xs text-gray-500">Full name</div>
                                                <div className="mt-1">{userDetails.name ?? '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Email</div>
                                                <div className="mt-1">{userDetails.email ?? '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Role</div>
                                                <div className="mt-1 capitalize">{userDetails.role ?? '-'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Onboarding status</div>
                                                <div className="mt-1">{(userDetails as any).onboardingStatus ?? 'unknown'}</div>
                                            </div>
                                            <div>
                                                <div className="text-xs text-gray-500">Price</div>
                                                <div className="mt-1">{userDetails.price !== undefined ? `$${userDetails.price}` : '-'}</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Onboarding answers */}
                                    <div className="col-span-1 lg:col-span-1 bg-white p-4 rounded shadow-sm border">
                                        <h3 className="text-sm font-semibold mb-3">Onboarding Answers</h3>
                                        <div className="text-sm text-gray-800">
                                            {(userDetails as any).personalQuestionnaire ? (
                                                renderQuestionnaire((userDetails as any).personalQuestionnaire as Record<string, unknown>)
                                            ) : (
                                                <div className="text-sm text-gray-500">No onboarding answers available.</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stats card */}
                                    <div className="col-span-1 lg:col-span-1 bg-white p-4 rounded shadow-sm border">
                                        <h3 className="text-sm font-semibold mb-3">Artwork Stats</h3>
                                        {statsLoading && <div className="text-sm text-gray-600">Loading stats...</div>}
                                        {statsError && <div className="text-sm text-red-600">{statsError}</div>}
                                        {stats && (
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                <div className="p-3 rounded bg-gray-50">
                                                    <div className="text-xs text-gray-500">Total</div>
                                                    <div className="text-lg font-semibold">{(stats as any).totalArtworks ?? (stats as any).total ?? '—'}</div>
                                                </div>
                                                <div className="p-3 rounded bg-gray-50">
                                                    <div className="text-xs text-gray-500">Vectorized</div>
                                                    <div className="text-lg font-semibold">{(stats as any).vectorized ?? '—'}</div>
                                                </div>
                                                <div className="p-3 rounded bg-gray-50">
                                                    <div className="text-xs text-gray-500">Indexed</div>
                                                    <div className="text-lg font-semibold">{(stats as any).indexed ?? '—'}</div>
                                                </div>
                                                <div className="p-3 rounded bg-gray-50">
                                                    <div className="text-xs text-gray-500">With Feedback</div>
                                                    <div className="text-lg font-semibold">{(stats as any).withFeedback ?? '—'}</div>
                                                </div>
                                                {/* Render all raw stats as small cards for consistency */}
                                                <div className="col-span-2 mt-2">
                                                    <h4 className="text-xs text-gray-500 mb-2">All stats</h4>
                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-gray-700">
                                                        {Object.entries(stats || {}).map(([k, v]) => {
                                                            const key = k;
                                                            const value = v as unknown;
                                                            const isPrimitive =
                                                                value === null ||
                                                                ['string', 'number', 'boolean'].includes(typeof value);

                                                            if (isPrimitive) {
                                                                return (
                                                                    <div key={key} className="p-2 bg-gray-50 rounded">
                                                                        <div className="text-xs text-gray-500">{humanize(key)}</div>
                                                                        <div className="font-semibold mt-1">{String(value ?? '—')}</div>
                                                                    </div>
                                                                );
                                                            }

                                                            // Nested structures: show formatted JSON in a full-width card
                                                            return (
                                                                <div key={key} className="col-span-2 sm:col-span-3 p-2 bg-gray-50 rounded">
                                                                    <div className="text-xs text-gray-500">{humanize(key)}</div>
                                                                    <pre className="mt-1 text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Catalog Panel */}
                    <div
                        role="tabpanel"
                        id="panel-catalog"
                        aria-labelledby="tab-catalog"
                        hidden={activeTab !== 'catalog'}
                    >
                        {!selectedUserId && <div>Please select a user to view the catalog.</div>}
                        {selectedUserId && (
                            <div>
                                <div className="mb-3">
                                    <label className="inline-flex items-center">
                                        <input type="checkbox" checked={hasFeedbackFilter} onChange={(e) => setHasFeedbackFilter(e.target.checked)} />
                                        <span className="ml-2 text-sm">Has Feedback</span>
                                    </label>
                                </div>

                                <CatalogForUser
                                    domainId={effectiveDomainId ?? domainId}
                                    userId={selectedUserId}
                                    hasFeedback={hasFeedbackFilter}
                                    onAddToDraft={(artwork) => {
                                        setProposalItem((currentDraft) => {
                                            const isAlreadyInProposal = currentDraft.some(
                                                (draftItem) => draftItem.artworkId === artwork.id
                                            );

                                            if (isAlreadyInProposal) {
                                                // Remove from proposal
                                                return currentDraft.filter(
                                                    (draftItem) => draftItem.artworkId !== artwork.id
                                                );
                                            } else {
                                                // Add to proposal
                                                return [
                                                    {
                                                        artworkId: artwork.id,
                                                        comments: [],
                                                        status: 'pending',
                                                        taggedAt: Date.now(),
                                                        title: artwork.title,
                                                        filename: artwork.filename,
                                                    },
                                                    ...currentDraft,
                                                ];
                                            }
                                        });
                                    }}
                                    showPreferenceButtons={false}
                                    ownersExperience={true}
                                    isInProposal={(artworkId) =>
                                        proposalItem.some((draftItem) => draftItem.artworkId === artworkId)
                                    }
                                />
                            </div>
                        )}
                    </div>

                    {/* AI Panel (unchanged) */}
                    <div
                        role="tabpanel"
                        id="panel-ai"
                        aria-labelledby="tab-ai"
                        hidden={activeTab !== 'ai'}
                    >
                        {!selectedUserId && <div>Please select a user to see AI suggestions.</div>}
                        {selectedUserId && (
                            <AISuggestionsPage
                                userId={selectedUserId}
                                proposalItems={proposalArtworkIds}
                                onAddToProposal={handleProposalToggle}
                                readonlyThumbs={true}
                            />
                        )}
                    </div>


                    {/* Proposal Panel */}
                    <div
                        role="tabpanel"
                        id="panel-proposal"
                        aria-labelledby="tab-proposal"
                        hidden={activeTab !== 'proposal'}
                    >
                        {!selectedUserId && <div>Please select a user to manage proposals.</div>}
                        {selectedUserId && (
                            <div>
                                {proposalDetails && (
                                    <div className="mb-4 p-4 bg-gray-50 border rounded shadow-sm">
                                        <h3 className="text-lg font-semibold">Proposal Details</h3>
                                        <p className="text-sm text-gray-600">
                                            <strong>Status:</strong> {proposalDetails.status}
                                        </p>
                                        <p className="text-sm text-gray-600">
                                            <strong>Created At:</strong> {new Date(proposalDetails.createdAt).toLocaleString()}
                                        </p>
                                        {proposalDetails.updatedAt && (
                                            <p className="text-sm text-gray-600">
                                                <strong>Last Updated:</strong> {new Date(proposalDetails.updatedAt).toLocaleString()}
                                            </p>
                                        )}
                                    </div>
                                )}

                                <SaleProposal
                                    domainId={effectiveDomainId ?? domainId}
                                    userId={selectedUserId}
                                    userName={userDetails?.name ?? userDetails?.email ?? 'Dealer'}
                                    draftItems={proposalItem}
                                    onDraftChange={(items: ProposalItem[]) => setProposalItem(items)}
                                    proposalId={proposalDetails?.id}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}