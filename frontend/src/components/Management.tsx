import React, { useState, useEffect, useCallback } from 'react';
import { User, Role, Domain, DomainRequest, DomainRequestStatus } from '@tastematcher/common';
import { useAuth } from '../contexts/AuthContext';
import { apiClient, ApiError } from '../services/api';
import { Navigate } from 'react-router-dom';
import './Management.css';

type TabType = 'users' | 'domains' | 'domain-requests';

/**
 * Management page for domain owners and global admins
 * - Domain owners: manage users in their domain
 * - Global admins: manage all domains and users across domains
 */
export function Management() {
  const { user } = useAuth();
  const isGlobalAdmin = user?.role === 'global_admin';
  const [activeTab, setActiveTab] = useState<TabType>(isGlobalAdmin ? 'domains' : 'users');
  const [users, setUsers] = useState<User[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [domainRequests, setDomainRequests] = useState<DomainRequest[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter and sort state for users
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<string>('all');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('all');
  const [userSortBy, setUserSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [userSortOrder, setUserSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Filter and sort state for domains
  const [domainSearchQuery, setDomainSearchQuery] = useState('');
  const [domainStatusFilter, setDomainStatusFilter] = useState<string>('all');
  const [domainSortBy, setDomainSortBy] = useState<'name' | 'adminEmail' | 'createdAt'>('createdAt');
  const [domainSortOrder, setDomainSortOrder] = useState<'asc' | 'desc'>('desc');
  
  // Filter and sort state for domain requests
  const [requestSearchQuery, setRequestSearchQuery] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState<string>('all');
  const [requestSortBy, setRequestSortBy] = useState<'name' | 'email' | 'createdAt'>('createdAt');
  const [requestSortOrder, setRequestSortOrder] = useState<'asc' | 'desc'>('desc');
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  
  // Invite form state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('customer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  // Create domain form state
  const [showCreateDomainModal, setShowCreateDomainModal] = useState(false);
  const [createDomainUserName, setCreateDomainUserName] = useState('');
  const [createDomainEmail, setCreateDomainEmail] = useState('');
  const [createDomainName, setCreateDomainName] = useState('');
  const [createDomainError, setCreateDomainError] = useState<string | null>(null);
  const [isCreatingDomain, setIsCreatingDomain] = useState(false);

  // Edit user form state
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<Role>('customer');
  const [editError, setEditError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Edit domain form state
  const [editDomainName, setEditDomainName] = useState('');
  const [editDomainError, setEditDomainError] = useState<string | null>(null);
  const [isEditingDomain, setIsEditingDomain] = useState(false);

  const loadUsers = useCallback(async (domainId?: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedUsers = await apiClient.getAllUsers(domainId);
      setUsers(fetchedUsers);
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadDomains = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedDomains = await apiClient.getAllDomains();
      setDomains(fetchedDomains);
      if (fetchedDomains.length > 0 && !selectedDomainId) {
        setSelectedDomainId(fetchedDomains[0].id);
      }
    } catch (err) {
      console.error('Failed to load domains:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to load domains');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDomainId]);

  const loadDomainRequests = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const fetchedRequests = await apiClient.getAllDomainRequests();
      setDomainRequests(fetchedRequests);
    } catch (err) {
      console.error('Failed to load domain requests:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to load domain requests');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isGlobalAdmin && activeTab === 'domains') {
      loadDomains();
    } else if (isGlobalAdmin && activeTab === 'domain-requests') {
      loadDomainRequests();
    } else if (activeTab === 'users') {
      if (isGlobalAdmin) {
        if (selectedDomainId) {
          loadUsers(selectedDomainId);
        }
      } else {
        loadUsers();
      }
    }
  }, [activeTab, selectedDomainId, isGlobalAdmin, loadUsers, loadDomains, loadDomainRequests]);

  const handleInvite = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteName.trim() || !inviteEmail.trim()) {
      setInviteError('Name and email are required');
      return;
    }

    try {
      setIsInviting(true);
      setInviteError(null);
      
      await apiClient.inviteUser({
        name: inviteName.trim(),
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
      });

      setInviteName('');
      setInviteEmail('');
      setInviteRole('customer');
      setShowInviteModal(false);
      await loadUsers(isGlobalAdmin ? selectedDomainId : undefined);
    } catch (err) {
      console.error('Failed to invite user:', err);
      setInviteError(err instanceof ApiError ? err.message : 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  }, [inviteName, inviteEmail, inviteRole, isGlobalAdmin, selectedDomainId, loadUsers]);

  const handleCreateDomain = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createDomainUserName.trim() || !createDomainEmail.trim() || !createDomainName.trim()) {
      setCreateDomainError('All fields are required');
      return;
    }

    try {
      setIsCreatingDomain(true);
      setCreateDomainError(null);
      
      await apiClient.createDomainByAdmin({
        userName: createDomainUserName.trim(),
        email: createDomainEmail.trim().toLowerCase(),
        domainName: createDomainName.trim(),
      });

      setCreateDomainUserName('');
      setCreateDomainEmail('');
      setCreateDomainName('');
      setShowCreateDomainModal(false);
      await loadDomains();
    } catch (err) {
      console.error('Failed to create domain:', err);
      setCreateDomainError(err instanceof ApiError ? err.message : 'Failed to create domain');
    } finally {
      setIsCreatingDomain(false);
    }
  }, [createDomainUserName, createDomainEmail, createDomainName, loadDomains]);

  const handleEditUser = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingUser || !editName.trim()) {
      setEditError('Name is required');
      return;
    }

    try {
      setIsEditing(true);
      setEditError(null);
      
      await apiClient.updateUser(editingUser.id, {
        name: editName.trim(),
        role: editRole,
      });

      setEditingUser(null);
      await loadUsers(isGlobalAdmin ? selectedDomainId : undefined);
    } catch (err) {
      console.error('Failed to update user:', err);
      setEditError(err instanceof ApiError ? err.message : 'Failed to update user');
    } finally {
      setIsEditing(false);
    }
  }, [editingUser, editName, editRole, isGlobalAdmin, selectedDomainId, loadUsers]);

  const handleEditDomain = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!editingDomain || !editDomainName.trim()) {
      setEditDomainError('Domain name is required');
      return;
    }

    try {
      setIsEditingDomain(true);
      setEditDomainError(null);
      
      await apiClient.updateDomain(editingDomain.id, {
        name: editDomainName.trim(),
      });

      setEditingDomain(null);
      await loadDomains();
    } catch (err) {
      console.error('Failed to update domain:', err);
      setEditDomainError(err instanceof ApiError ? err.message : 'Failed to update domain');
    } finally {
      setIsEditingDomain(false);
    }
  }, [editingDomain, editDomainName, loadDomains]);

  const handleDeleteUser = useCallback(async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to delete user "${userName}"? This will also delete all their preferences.`)) {
      return;
    }

    try {
      await apiClient.deleteUser(userId);
      await loadUsers(isGlobalAdmin ? selectedDomainId : undefined);
    } catch (err) {
      console.error('Failed to delete user:', err);
      alert(err instanceof ApiError ? err.message : 'Failed to delete user');
    }
  }, [isGlobalAdmin, selectedDomainId, loadUsers]);

  const handleDeleteDomain = useCallback(async (domainId: string, domainName: string) => {
    if (!window.confirm(`Are you sure you want to delete domain "${domainName}"? This will delete ALL users, artworks, and data associated with this domain. This action cannot be undone.`)) {
      return;
    }

    try {
      await apiClient.deleteDomain(domainId);
      await loadDomains();
    } catch (err) {
      console.error('Failed to delete domain:', err);
      alert(err instanceof ApiError ? err.message : 'Failed to delete domain');
    }
  }, [loadDomains]);

  const handleResendInvite = useCallback(async (user: User) => {
    try {
      await apiClient.inviteUser({
        name: user.name,
        email: user.email,
        role: user.role,
      });
      
      alert(`Invitation email resent to ${user.email}`);
    } catch (err) {
      console.error('Failed to resend invitation:', err);
      alert(err instanceof ApiError ? err.message : 'Failed to resend invitation');
    }
  }, []);

  const handleResendDomainVerification = useCallback(async (domain: Domain) => {
    try {
      await apiClient.requestDomainVerification(domain.adminEmail);
      alert(`Verification email resent to ${domain.adminEmail}`);
    } catch (err) {
      console.error('Failed to resend verification:', err);
      alert(err instanceof ApiError ? err.message : 'Failed to resend verification');
    }
  }, []);

  const openEditUserModal = useCallback((user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditRole(user.role);
    setEditError(null);
  }, []);

  const openEditDomainModal = useCallback((domain: Domain) => {
    setEditingDomain(domain);
    setEditDomainName(domain.name);
    setEditDomainError(null);
  }, []);

  // Filter and sort users
  const filteredAndSortedUsers = React.useMemo(() => {
    let filtered = [...users];
    
    // Apply search filter
    if (userSearchQuery.trim()) {
      const query = userSearchQuery.toLowerCase();
      filtered = filtered.filter(u => 
        u.name.toLowerCase().includes(query) ||
        u.email.toLowerCase().includes(query)
      );
    }
    
    // Apply role filter
    if (userRoleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === userRoleFilter);
    }
    
    // Apply status filter
    if (userStatusFilter !== 'all') {
      filtered = filtered.filter(u => u.status === userStatusFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number = a[userSortBy];
      let bValue: string | number = b[userSortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (userSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  }, [users, userSearchQuery, userRoleFilter, userStatusFilter, userSortBy, userSortOrder]);

  // Filter and sort domains
  const filteredAndSortedDomains = React.useMemo(() => {
    let filtered = [...domains];
    
    // Apply search filter
    if (domainSearchQuery.trim()) {
      const query = domainSearchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.name.toLowerCase().includes(query) ||
        d.adminEmail.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (domainStatusFilter !== 'all') {
      filtered = filtered.filter(d => (d.status || 'active') === domainStatusFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number = a[domainSortBy];
      let bValue: string | number = b[domainSortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (domainSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  }, [domains, domainSearchQuery, domainStatusFilter, domainSortBy, domainSortOrder]);

  // Filter and sort domain requests
  const filteredAndSortedRequests = React.useMemo(() => {
    let filtered = [...domainRequests];
    
    // Apply search filter
    if (requestSearchQuery.trim()) {
      const query = requestSearchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        r.name.toLowerCase().includes(query) ||
        r.email.toLowerCase().includes(query) ||
        r.proposedDomainName.toLowerCase().includes(query)
      );
    }
    
    // Apply status filter
    if (requestStatusFilter !== 'all') {
      filtered = filtered.filter(r => r.status === requestStatusFilter);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      let aValue: string | number = a[requestSortBy];
      let bValue: string | number = b[requestSortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue as string).toLowerCase();
      }
      
      if (requestSortOrder === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    return filtered;
  }, [domainRequests, requestSearchQuery, requestStatusFilter, requestSortBy, requestSortOrder]);

  // Check authorization - AFTER all hooks
  if (!user || (user.role !== 'domain_owner' && user.role !== 'global_admin')) {
    return <Navigate to="/home" replace />;
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      pending_verification: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
      onboarded: 'bg-blue-100 text-blue-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getRoleBadge = (role: Role) => {
    const colors = {
      domain_owner: 'bg-purple-100 text-purple-800',
      dealer: 'bg-blue-100 text-blue-800',
      customer: 'bg-gray-100 text-gray-800',
      global_admin: 'bg-red-100 text-red-800',
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  const getDomainStatusBadge = (status?: string) => {
    if (!status) return 'bg-gray-100 text-gray-800';
    const colors = {
      pending_verification: 'bg-yellow-100 text-yellow-800',
      active: 'bg-green-100 text-green-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getDomainRequestStatusBadge = (status: DomainRequestStatus) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-md">
          {/* Tabs for global admin */}
          {isGlobalAdmin && (
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px overflow-x-auto">
                <button
                  onClick={() => setActiveTab('domains')}
                  className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'domains'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Domains
                </button>
                <button
                  onClick={() => setActiveTab('users')}
                  className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'users'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Users
                </button>
                <button
                  onClick={() => setActiveTab('domain-requests')}
                  className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeTab === 'domain-requests'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Domain Requests
                </button>
              </nav>
            </div>
          )}

          <div className="p-4 sm:p-6">
            {/* Users Tab */}
            {activeTab === 'users' && (
              <>
                <div className="mb-6">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">User Management</h1>
                    <button
                      onClick={() => setShowInviteModal(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto"
                    >
                      + Invite User
                    </button>
                  </div>
                  {isGlobalAdmin && domains.length > 0 && (
                    <div className="mt-4">
                      <label htmlFor="domain-select" className="block text-sm font-medium text-gray-700 mb-2">
                        Select Domain
                      </label>
                      <select
                        id="domain-select"
                        value={selectedDomainId}
                        onChange={(e) => setSelectedDomainId(e.target.value)}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent hover:bg-gray-100 transition-colors cursor-pointer"
                      >
                        {domains.map((domain) => (
                          <option key={domain.id} value={domain.id}>
                            {domain.name} ({domain.adminEmail})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  
                  {/* User Filters */}
                  <div className="management-filters">
                    <div className="management-filter-group">
                      <label htmlFor="user-search" className="management-filter-label">
                        Search
                      </label>
                      <input
                        id="user-search"
                        type="text"
                        placeholder="Search by name or email..."
                        value={userSearchQuery}
                        onChange={(e) => setUserSearchQuery(e.target.value)}
                        className="management-filter-input"
                      />
                    </div>
                    
                    <div className="management-filter-group">
                      <label htmlFor="user-role-filter" className="management-filter-label">
                        Role
                      </label>
                      <select
                        id="user-role-filter"
                        value={userRoleFilter}
                        onChange={(e) => setUserRoleFilter(e.target.value)}
                        className="management-filter-select"
                      >
                        <option value="all">All Roles</option>
                        <option value="customer">Customer</option>
                        <option value="dealer">Dealer</option>
                        <option value="domain_owner">Domain Owner</option>
                        <option value="global_admin">Global Admin</option>
                      </select>
                    </div>
                    
                    <div className="management-filter-group">
                      <label htmlFor="user-status-filter" className="management-filter-label">
                        Status
                      </label>
                      <select
                        id="user-status-filter"
                        value={userStatusFilter}
                        onChange={(e) => setUserStatusFilter(e.target.value)}
                        className="management-filter-select"
                      >
                        <option value="all">All Statuses</option>
                        <option value="pending_verification">Pending</option>
                        <option value="active">Active</option>
                      </select>
                    </div>
                    
                    <div className="management-filter-group">
                      <label htmlFor="user-sort" className="management-filter-label">
                        Sort By
                      </label>
                      <div className="management-sort-controls">
                        <select
                          id="user-sort"
                          value={userSortBy}
                          onChange={(e) => setUserSortBy(e.target.value as any)}
                          className="management-filter-select management-sort-select"
                        >
                          <option value="name">Name</option>
                          <option value="email">Email</option>
                          <option value="createdAt">Date</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setUserSortOrder(userSortOrder === 'asc' ? 'desc' : 'asc')}
                          className="management-sort-button"
                          title={userSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                          aria-label={userSortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
                        >
                          {userSortOrder === 'asc' ? '↑' : '↓'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredAndSortedUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{u.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{u.email}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadge(u.role)}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(u.status)}`}>
                                  {u.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                {u.role !== 'domain_owner' && u.role !== 'global_admin' && u.id !== user.id && (
                                  <div className="flex justify-end gap-2">
                                    {u.status === 'pending_verification' && (
                                      <button onClick={() => handleResendInvite(u)} className="text-green-600 hover:text-green-900" title="Resend invitation email">
                                        Resend
                                      </button>
                                    )}
                                    <button onClick={() => openEditUserModal(u)} className="text-blue-600 hover:text-blue-900">
                                      Edit
                                    </button>
                                    <button onClick={() => handleDeleteUser(u.id, u.name)} className="text-red-600 hover:text-red-900">
                                      Delete
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {filteredAndSortedUsers.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No users found matching your filters</p>
                        </div>
                      )}
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden space-y-4">
                      {filteredAndSortedUsers.map((u) => (
                        <div key={u.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900">{u.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{u.email}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getRoleBadge(u.role)}`}>
                              {u.role}
                            </span>
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(u.status)}`}>
                              {u.status}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 mb-3">
                            Created: {formatDate(u.createdAt)}
                          </div>

                          {u.role !== 'domain_owner' && u.role !== 'global_admin' && u.id !== user.id && (
                            <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                              {u.status === 'pending_verification' && (
                                <button 
                                  onClick={() => handleResendInvite(u)} 
                                  className="flex-1 text-center px-3 py-2 text-sm text-green-600 hover:text-green-900 border border-green-300 rounded-lg"
                                >
                                  Resend
                                </button>
                              )}
                              <button 
                                onClick={() => openEditUserModal(u)} 
                                className="flex-1 text-center px-3 py-2 text-sm text-blue-600 hover:text-blue-900 border border-blue-300 rounded-lg"
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.id, u.name)} 
                                className="flex-1 text-center px-3 py-2 text-sm text-red-600 hover:text-red-900 border border-red-300 rounded-lg"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      {filteredAndSortedUsers.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No users found matching your filters</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Domains Tab (Global Admin Only) */}
            {activeTab === 'domains' && isGlobalAdmin && (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Domain Management</h1>
                  <button
                    onClick={() => setShowCreateDomainModal(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors w-full sm:w-auto"
                  >
                    + Create Domain
                  </button>
                </div>
                
                {/* Domain Filters */}
                <div className="management-filters">
                  <div className="management-filter-group">
                    <label htmlFor="domain-search" className="management-filter-label">
                      Search
                    </label>
                    <input
                      id="domain-search"
                      type="text"
                      placeholder="Search by name or email..."
                      value={domainSearchQuery}
                      onChange={(e) => setDomainSearchQuery(e.target.value)}
                      className="management-filter-input"
                    />
                  </div>
                  
                  <div className="management-filter-group">
                    <label htmlFor="domain-status-filter" className="management-filter-label">
                      Status
                    </label>
                    <select
                      id="domain-status-filter"
                      value={domainStatusFilter}
                      onChange={(e) => setDomainStatusFilter(e.target.value)}
                      className="management-filter-select"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending_verification">Pending</option>
                      <option value="active">Active</option>
                    </select>
                  </div>
                  
                  <div className="management-filter-group">
                    <label htmlFor="domain-sort" className="management-filter-label">
                      Sort By
                    </label>
                    <div className="management-sort-controls">
                      <select
                        id="domain-sort"
                        value={domainSortBy}
                        onChange={(e) => setDomainSortBy(e.target.value as any)}
                        className="management-filter-select management-sort-select"
                      >
                        <option value="name">Name</option>
                        <option value="adminEmail">Email</option>
                        <option value="createdAt">Date</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setDomainSortOrder(domainSortOrder === 'asc' ? 'desc' : 'asc')}
                        className="management-sort-button"
                        title={domainSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                        aria-label={domainSortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
                      >
                        {domainSortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Domain Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Admin Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredAndSortedDomains.map((d) => (
                            <tr key={d.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{d.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{d.adminEmail}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getDomainStatusBadge(d.status)}`}>
                                  {d.status || 'active'}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(d.createdAt)}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <div className="flex justify-end gap-2">
                                  {d.status !== 'active' && (
                                    <button onClick={() => handleResendDomainVerification(d)} className="text-green-600 hover:text-green-900" title="Resend verification email">
                                      Resend
                                    </button>
                                  )}
                                  <button onClick={() => openEditDomainModal(d)} className="text-blue-600 hover:text-blue-900">
                                    Edit
                                  </button>
                                  <button onClick={() => handleDeleteDomain(d.id, d.name)} className="text-red-600 hover:text-red-900">
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {filteredAndSortedDomains.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No domains found matching your filters</p>
                        </div>
                      )}
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden space-y-4">
                      {filteredAndSortedDomains.map((d) => (
                        <div key={d.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900">{d.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{d.adminEmail}</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-2 mb-3">
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getDomainStatusBadge(d.status)}`}>
                              {d.status || 'active'}
                            </span>
                          </div>

                          <div className="text-xs text-gray-500 mb-3">
                            Created: {formatDate(d.createdAt)}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-200">
                            {d.status !== 'active' && (
                              <button 
                                onClick={() => handleResendDomainVerification(d)} 
                                className="flex-1 text-center px-3 py-2 text-sm text-green-600 hover:text-green-900 border border-green-300 rounded-lg"
                              >
                                Resend
                              </button>
                            )}
                            <button 
                              onClick={() => openEditDomainModal(d)} 
                              className="flex-1 text-center px-3 py-2 text-sm text-blue-600 hover:text-blue-900 border border-blue-300 rounded-lg"
                            >
                              Edit
                            </button>
                            <button 
                              onClick={() => handleDeleteDomain(d.id, d.name)} 
                              className="flex-1 text-center px-3 py-2 text-sm text-red-600 hover:text-red-900 border border-red-300 rounded-lg"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}

                      {filteredAndSortedDomains.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No domains found matching your filters</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Domain Requests Tab (Global Admin Only) */}
            {activeTab === 'domain-requests' && isGlobalAdmin && (
              <>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                  <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Domain Requests</h1>
                </div>
                
                {/* Request Filters */}
                <div className="management-filters">
                  <div className="management-filter-group">
                    <label htmlFor="request-search" className="management-filter-label">
                      Search
                    </label>
                    <input
                      id="request-search"
                      type="text"
                      placeholder="Search by name or email..."
                      value={requestSearchQuery}
                      onChange={(e) => setRequestSearchQuery(e.target.value)}
                      className="management-filter-input"
                    />
                  </div>
                  
                  <div className="management-filter-group">
                    <label htmlFor="request-status-filter" className="management-filter-label">
                      Status
                    </label>
                    <select
                      id="request-status-filter"
                      value={requestStatusFilter}
                      onChange={(e) => setRequestStatusFilter(e.target.value)}
                      className="management-filter-select"
                    >
                      <option value="all">All Statuses</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  
                  <div className="management-filter-group">
                    <label htmlFor="request-sort" className="management-filter-label">
                      Sort By
                    </label>
                    <div className="management-sort-controls">
                      <select
                        id="request-sort"
                        value={requestSortBy}
                        onChange={(e) => setRequestSortBy(e.target.value as any)}
                        className="management-filter-select management-sort-select"
                      >
                        <option value="name">Name</option>
                        <option value="email">Email</option>
                        <option value="createdAt">Date</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => setRequestSortOrder(requestSortOrder === 'asc' ? 'desc' : 'asc')}
                        className="management-sort-button"
                        title={requestSortOrder === 'asc' ? 'Ascending' : 'Descending'}
                        aria-label={requestSortOrder === 'asc' ? 'Sort ascending' : 'Sort descending'}
                      >
                        {requestSortOrder === 'asc' ? '↑' : '↓'}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {isLoading ? (
                  <div className="flex justify-center items-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proposed Domain</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredAndSortedRequests.map((req) => (
                            <tr key={req.id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm font-medium text-gray-900">{req.name}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-500">{req.email}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <div className="text-sm text-gray-900">{req.proposedDomainName}</div>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getDomainRequestStatusBadge(req.status)}`}>
                                  {req.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                {formatDate(req.createdAt)}
                              </td>
                              <td className="px-6 py-4">
                                <div className="text-sm text-gray-500 max-w-xs truncate" title={req.message}>
                                  {req.message || '—'}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {filteredAndSortedRequests.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No requests found matching your filters</p>
                        </div>
                      )}
                    </div>

                    {/* Mobile Cards */}
                    <div className="sm:hidden space-y-4">
                      {filteredAndSortedRequests.map((req) => (
                        <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <h3 className="text-base font-semibold text-gray-900">{req.name}</h3>
                              <p className="text-sm text-gray-500 mt-1">{req.email}</p>
                            </div>
                          </div>
                          
                          <div className="space-y-2 mb-3">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500">Proposed Domain:</span>
                              <span className="text-sm text-gray-900">{req.proposedDomainName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-500">Status:</span>
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getDomainRequestStatusBadge(req.status)}`}>
                                {req.status}
                              </span>
                            </div>
                          </div>

                          {req.message && (
                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <p className="text-xs font-medium text-gray-500 mb-1">Message:</p>
                              <p className="text-sm text-gray-700">{req.message}</p>
                            </div>
                          )}

                          <div className="text-xs text-gray-500">
                            Submitted: {formatDate(req.createdAt)}
                          </div>
                        </div>
                      ))}

                      {filteredAndSortedRequests.length === 0 && (
                        <div className="text-center py-12">
                          <p className="text-gray-500">No requests found matching your filters</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Create Domain Modal */}
      {showCreateDomainModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Domain</h2>
            
            <form onSubmit={handleCreateDomain} className="space-y-4">
              <div>
                <label htmlFor="createDomainUserName" className="block text-sm font-medium text-gray-700 mb-2">Admin Name</label>
                <input
                  id="createDomainUserName"
                  type="text"
                  value={createDomainUserName}
                  onChange={(e) => setCreateDomainUserName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label htmlFor="createDomainEmail" className="block text-sm font-medium text-gray-700 mb-2">Admin Email</label>
                <input
                  id="createDomainEmail"
                  type="email"
                  value={createDomainEmail}
                  onChange={(e) => setCreateDomainEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="admin@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="createDomainName" className="block text-sm font-medium text-gray-700 mb-2">Domain Name</label>
                <input
                  id="createDomainName"
                  type="text"
                  value={createDomainName}
                  onChange={(e) => setCreateDomainName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="My Gallery"
                  required
                />
              </div>

              {createDomainError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{createDomainError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateDomainModal(false);
                    setCreateDomainUserName('');
                    setCreateDomainEmail('');
                    setCreateDomainName('');
                    setCreateDomainError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isCreatingDomain}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
                  disabled={isCreatingDomain}
                >
                  {isCreatingDomain ? 'Creating...' : 'Create Domain'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite User Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Invite New User</h2>
            
            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label htmlFor="inviteName" className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  id="inviteName"
                  type="text"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="John Doe"
                  required
                />
              </div>

              <div>
                <label htmlFor="inviteEmail" className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="john@example.com"
                  required
                />
              </div>

              <div>
                <label htmlFor="inviteRole" className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  id="inviteRole"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="customer">Customer</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>

              {inviteError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{inviteError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteName('');
                    setInviteEmail('');
                    setInviteRole('customer');
                    setInviteError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isInviting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
                  disabled={isInviting}
                >
                  {isInviting ? 'Inviting...' : 'Send Invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Edit User</h2>
            
            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label htmlFor="editName" className="block text-sm font-medium text-gray-700 mb-2">Name</label>
                <input
                  id="editName"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="editRole" className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                <select
                  id="editRole"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="customer">Customer</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{editError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null);
                    setEditError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isEditing}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
                  disabled={isEditing}
                >
                  {isEditing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Domain Modal */}
      {editingDomain && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Edit Domain</h2>
            
            <form onSubmit={handleEditDomain} className="space-y-4">
              <div>
                <label htmlFor="editDomainName" className="block text-sm font-medium text-gray-700 mb-2">Domain Name</label>
                <input
                  id="editDomainName"
                  type="text"
                  value={editDomainName}
                  onChange={(e) => setEditDomainName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {editDomainError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-sm text-red-600">{editDomainError}</p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingDomain(null);
                    setEditDomainError(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  disabled={isEditingDomain}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:bg-gray-400"
                  disabled={isEditingDomain}
                >
                  {isEditingDomain ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
