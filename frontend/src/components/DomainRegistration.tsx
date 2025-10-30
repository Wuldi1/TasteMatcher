// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`).
// 2. Uses shared `common` types for domain operations.
// 3. Includes comprehensive form validation and error handling.
// 4. Adds structured logging for user interactions.
// 5. Adds input validation and sanitization.
// 6. Professional UI with loading states and feedback.
// 7. Accessible form design with proper labels.
// 8. Includes JSDoc for component props.
// 9. CI-friendly: passes typecheck and lint.
// -----------------------------------------------------------

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDomain } from '../contexts/DomainContext';
import { apiClient, ApiError } from '../services/api';
import { Domain } from 'common';

/**
 * Professional domain registration component
 * Handles domain existence check and creation
 */
export function DomainRegistration() {
  const navigate = useNavigate();
  const { setCurrentDomain, setLoading, isLoading } = useDomain();
  
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [domainName, setDomainName] = useState<string>('');
  const [errors, setErrors] = useState<{ adminEmail?: string; domainName?: string; general?: string }>({});
  const [phase, setPhase] = useState<'email' | 'create' | 'code-entry'>('email');
  const [pendingDomain, setPendingDomain] = useState<Domain | null>(null);
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [verificationError, setVerificationError] = useState<string | null>(null);

  const getStepMessage = useCallback((): string => {
    if (!isLoading) {
      return '';
    }

    switch (phase) {
      case 'email':
        return 'Checking your domain...';
      case 'create':
        return 'Creating your domain and sending the verification code...';
      case 'code-entry':
        return 'Sending verification code...';
      default:
        return 'Processing your request...';
    }
  }, [isLoading, phase]);

  const validateForm = useCallback((): boolean => {
    const newErrors: typeof errors = {};

    if (!adminEmail.trim()) {
      newErrors.adminEmail = 'Admin email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      newErrors.adminEmail = 'Please enter a valid email address';
    }

    if (phase === 'create') {
      if (!domainName.trim()) {
        newErrors.domainName = 'Domain name is required';
      } else if (domainName.trim().length < 2) {
        newErrors.domainName = 'Domain name must be at least 2 characters';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [adminEmail, domainName, phase]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!validateForm()) {
        return;
      }

      setLoading(true);

      try {
        if (phase === 'email') {
          try {
            const domain = await apiClient.requestDomainVerification(adminEmail.trim().toLowerCase());
            setPendingDomain(domain);
            setPhase('code-entry');
            setVerificationCode('');
            setVerificationError(null);
            setErrors({});
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) {
              setPhase('create');
              setErrors({});
            } else {
              throw error;
            }
          }
        } else if (phase === 'create') {
          const request: Domain = {
            id: '',
            name: domainName.trim(),
            adminEmail: adminEmail.trim().toLowerCase(),
          };
          const domain = await apiClient.createDomain(request);
          setPendingDomain(domain);
          setPhase('code-entry');
          setVerificationCode('');
          setVerificationError(null);
          setErrors({});
        }
      } catch (error) {
        console.error('Domain Registration Error:', error);
        if (error instanceof ApiError) {
          setErrors({
            general:
              error.status === 409
                ? 'A domain with this email already exists.'
                : error.message || 'An error occurred. Please try again later.',
          });
        } else {
          setErrors({
            general: 'Network error. Please check your connection and try again.',
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [adminEmail, domainName, phase, setLoading, validateForm],
  );

  const handleVerifyCode = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();

      if (!pendingDomain) {
        return;
      }

      if (verificationCode.trim().length !== 6) {
        setVerificationError('Please enter the 6-digit code.');
        return;
      }

      setLoading(true);
      setVerificationError(null);

      try {
        const result = await apiClient.verifyDomainCode(
          pendingDomain.adminEmail,
          verificationCode.trim(),
        );
        localStorage.setItem('tm_auth_token', result.token);
        setCurrentDomain(pendingDomain);
        navigate('/upload');
      } catch (error) {
        console.error('Domain Verification Error:', error);
        if (error instanceof ApiError) {
          setVerificationError(
            error.status === 400
              ? 'Invalid or expired verification code.'
              : error.message || 'Verification failed. Please try again later.',
          );
        } else {
          setVerificationError('Network error. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    },
    [navigate, pendingDomain, setCurrentDomain, setLoading, verificationCode],
  );

  const handleResend = useCallback(async () => {
    if (!pendingDomain) {
      return;
    }

    try {
      setLoading(true);
      await apiClient.requestDomainVerification(pendingDomain.adminEmail);
      setVerificationError(null);
    } catch (error) {
      console.error('Resend Verification Error:', error);
      setVerificationError('Could not resend code. Please try again later.');
    } finally {
      setLoading(false);
    }
  }, [pendingDomain, setLoading]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            TasteMatcher
          </h1>
          <p className="text-gray-600">
            Register your domain to start uploading artwork
          </p>
        </div>

        {phase !== 'code-entry' ? (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="adminEmail" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Email
              </label>
              <input
                id="adminEmail"
                type="email"
                value={adminEmail}
                onChange={(e) => {
                  setAdminEmail(e.target.value);
                  if (errors.adminEmail) {
                    setErrors((prev) => ({ ...prev, adminEmail: undefined }));
                  }
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.adminEmail ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="admin@mygallery.com"
                disabled={isLoading || phase === 'create'}
                required
              />
              {errors.adminEmail && (
                <p className="mt-1 text-sm text-red-600">{errors.adminEmail}</p>
              )}
            </div>

            {phase === 'create' && (
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Domain Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={domainName}
                  onChange={(e) => {
                    setDomainName(e.target.value);
                    if (errors.domainName) {
                      setErrors((prev) => ({ ...prev, domainName: undefined }));
                    }
                  }}
                  className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                    errors.domainName ? 'border-red-300' : 'border-gray-300'
                  }`}
                  placeholder="My Gallery"
                  disabled={isLoading}
                  required
                />
                {errors.domainName && <p className="mt-1 text-sm text-red-600">{errors.domainName}</p>}
              </div>
            )}

            {errors.general && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-600">{errors.general}</p>
              </div>
            )}

            {isLoading && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <p className="text-sm text-blue-600">{getStepMessage()}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              } text-white`}
            >
              {phase === 'email'
                ? isLoading
                  ? 'Processing...'
                  : 'Send Code'
                : isLoading
                ? 'Creating...'
                : 'Create Domain & Send Code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <p className="text-sm text-gray-500 mb-2">
              Hi {pendingDomain?.name}, we sent a verification code to{' '}
              <strong>{pendingDomain?.adminEmail}</strong>. Please enter the code to continue.
            </p>
            <div>
              <label 
                htmlFor="verificationCode" 
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Verification Code
              </label>
              <input
                id="verificationCode"
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  verificationError ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Enter your code"
                disabled={isLoading}
                required
              />
              {verificationError && (
                <p className="mt-1 text-sm text-red-600">{verificationError}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-lg font-medium transition-colors ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              } text-white`}
            >
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={handleResend}
                disabled={isLoading}
                className="text-blue-600 hover:text-blue-800 disabled:text-gray-400"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            By registering, you agree to our terms of service
          </p>
        </div>
      </div>
    </div>
  );
}
