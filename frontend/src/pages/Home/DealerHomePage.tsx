import { useAuth } from '../../hooks/useAuth';
import { useProposalData } from '../../hooks/useProposalData';
import { Link } from 'react-router-dom';
import { Users, ShoppingCart, FileText, PlusCircle, BarChart2, CheckCircle, Image } from 'lucide-react';
import './HomePage.css';
import { useEffect, useState } from 'react';
import { apiClient } from '../../utils/api';

export function DealerHomePage() {
    const { user } = useAuth();
    const { proposals, hasSubmittedProposal, loading } = useProposalData(user?.domainId!, undefined, user?.role === 'dealer' ? user?.id : undefined);
    const [recentArtworks, setRecentArtworks] = useState<number>(0);

    useEffect(() => {
        const fetchRecentArtworks = async () => {
            try {
                const stats = await apiClient.getUserStats();
                setRecentArtworks(stats?.recentlyAdded || 0);
            } catch (err) {
                console.error('Failed to fetch recent artworks stats', err);
            }
        };

        if (user?.domainId) {
            fetchRecentArtworks();
        }
    }, [user?.domainId]);

    if (!user) {
        return null;
    }

    // Calculate stats
    const totalProposals = proposals?.length || 0;
    const pendingProposals = proposals?.filter((p) => p.status === 'submitted').length || 0;
    const acceptedProposals = proposals?.filter((p) => p.status === 'accepted').length || 0;

    if (loading) {
        return <div>Loading proposals...</div>;
    }

    return (
        <div className="dealer-home-page p-4 sm:p-6 md:p-8 space-y-8">
            {/* Welcome Header */}
            <header className="bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg p-6 shadow-md">
                <h1 className="text-3xl font-bold">Hello, {user.name}!</h1>
                <p className="text-lg mt-2">Manage your gallery and customers effectively.</p>
            </header>

            {/* Dealer Stats */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Your Stats</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <BarChart2 className="w-10 h-10 text-blue-500" />
                        <h3 className="text-lg font-medium mt-2">{totalProposals}</h3>
                        <p className="text-sm text-gray-600">Total Proposals</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <FileText className="w-10 h-10 text-yellow-500" />
                        <h3 className="text-lg font-medium mt-2">{pendingProposals}</h3>
                        <p className="text-sm text-gray-600">Pending Proposals</p>
                    </div>
                    <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                        <CheckCircle className="w-10 h-10 text-green-500" />
                        <h3 className="text-lg font-medium mt-2">{acceptedProposals}</h3>
                        <p className="text-sm text-gray-600">Accepted Proposals</p>
                    </div>
                </div>
            </section>

            {/* Dealer Actions */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Actions</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <Link to="/management" className="bg-blue-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-blue-200">
                        <Users className="w-10 h-10 text-blue-500" />
                        <h3 className="text-lg font-medium mt-2">Manage Users</h3>
                        <p className="text-sm text-gray-600 text-center">Invite users, manage roles, and track activity.</p>
                    </Link>
                    <Link to="/sales" className="bg-green-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-green-200">
                        <ShoppingCart className="w-10 h-10 text-green-500" />
                        <h3 className="text-lg font-medium mt-2">Manage Proposals</h3>
                        <p className="text-sm text-gray-600 text-center">Create and manage sales proposals for your customers.</p>
                    </Link>
                    <Link to="/upload" className="bg-yellow-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-yellow-200">
                        <PlusCircle className="w-10 h-10 text-yellow-500" />
                        <h3 className="text-lg font-medium mt-2">Upload Artworks</h3>
                        <p className="text-sm text-gray-600 text-center">Add new artworks to your gallery.</p>
                    </Link>
                    {hasSubmittedProposal && (
                        <Link to="/buying-proposal" className="bg-purple-100 rounded-lg shadow-md p-4 flex flex-col items-center hover:bg-purple-200">
                            <FileText className="w-10 h-10 text-purple-500" />
                            <h3 className="text-lg font-medium mt-2">View Proposals</h3>
                            <p className="text-sm text-gray-600 text-center">Track customer responses to your proposals.</p>
                        </Link>
                    )}
                </div>
            </section>

            {/* Recent Activity */}
            <section className="space-y-6">
                <h2 className="text-xl font-semibold">Recent Activity</h2>
                <div className="bg-white rounded-lg shadow-md p-4 space-y-4">
                    {/* Recent Artworks */}
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Image className="w-6 h-6 text-blue-500" />
                            <span className="text-sm font-medium">New Artworks Uploaded</span>
                        </div>
                        <span className="text-sm text-gray-600">{recentArtworks} in the past week</span>
                        <Link to="/catalog" className="text-blue-500 text-sm hover:underline">
                            View Catalog
                        </Link>
                    </div>

                    {/* Recent Proposals */}
                    {proposals?.length === 0 ? (
                        <p className="text-sm text-gray-600">No recent proposals.</p>
                    ) : (
                        <ul className="space-y-4">
                            {proposals?.slice(0, 5).map((proposal) => {
                                const approvedCount = proposal.items?.filter((item) => item.status === 'approved').length || 0;
                                const rejectedCount = proposal.items?.filter((item) => item.status === 'rejected').length || 0;
                                const pendingCount = proposal.items?.filter((item) => item.status === 'pending').length || 0;

                                return (
                                    <li key={proposal.id} className="flex justify-between items-center">
                                        <div>
                                            <h3 className="text-sm font-medium">{`Proposal #${proposal.id}`}</h3>
                                            <p className="text-xs text-gray-500">
                                                {approvedCount} Approved, {rejectedCount} Rejected, {pendingCount} Pending
                                            </p>
                                            <p className="text-xs text-gray-400">
                                                Last Updated: {new Date(proposal.updatedAt || 'NaN').toLocaleString()}
                                            </p>
                                        </div>
                                        <Link
                                            to={`/sales/${proposal.id}`}
                                            className="text-blue-500 text-sm hover:underline"
                                        >
                                            View
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </section>
        </div>
    );
}
