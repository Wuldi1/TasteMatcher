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
import { CreateDomainRequest } from 'common';

interface FormData {
  name: string;
  adminEmail: string;
}

interface FormErrors {
  name?: string;
  adminEmail?: string;
  general?: string;
}

/**
 * Professional domain registration component
 * Handles domain existence check and creation
 */
export function DomainRegistration() {
  const navigate = useNavigate();
  const { setCurrentDomain, setLoading, isLoading } = useDomain();
  
  const [formData, setFormData] = useState<FormData>({
    name: '',
    adminEmail: '',
  });
  
  const [errors, setErrors] = useState<FormErrors>({});
  const [step, setStep] = useState<'form' | 'checking' | 'exists' | 'creating'>('form');

  const validateForm = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Domain name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Domain name must be at least 2 characters';
    }

    if (!formData.adminEmail.trim()) {
      newErrors.adminEmail = 'Admin email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.adminEmail)) {
      newErrors.adminEmail = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleInputChange = useCallback((field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  }, [errors]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setLoading(true);
    setStep('checking');
    
    console.info('Domain Registration:', { 
      action: 'checking_existence', 
      email: formData.adminEmail 
    });

    try {
      // First, check if domain exists
      const validation = await apiClient.validateDomain(formData.adminEmail);
      console.log('Domain Validation Result:', validation);
      
      if (validation.isValid) {
        setStep('exists');
        setErrors({ general: 'A domain with this email already exists. Please use a different email.' });
        return;
      }

      // Create new domain
      setStep('creating');
      console.info('Domain Registration:', { action: 'creating_domain' });
      
      const request: CreateDomainRequest = {
        name: formData.name.trim(),
        adminEmail: formData.adminEmail.trim().toLowerCase(),
      };

      const newDomain = await apiClient.createDomain(request);
      
      console.info('Domain Registration:', { 
        action: 'created_successfully', 
        domainId: newDomain.id 
      });

      setCurrentDomain(newDomain);
      navigate('/upload');

    } catch (error) {
      console.error('Domain Registration Error:', error);
      
      if (error instanceof ApiError) {
        if (error.status === 409) {
          setErrors({ general: 'A domain with this email already exists.' });
        } else if (error.status === 400) {
          setErrors({ general: 'Please check your input and try again.' });
        } else {
          setErrors({ general: 'An error occurred. Please try again later.' });
        }
      } else {
        setErrors({ general: 'Network error. Please check your connection and try again.' });
      }
    } finally {
      setLoading(false);
      setStep('form');
    }
  }, [formData, validateForm, setLoading, setCurrentDomain, navigate]);

  const getStepMessage = (): string => {
    switch (step) {
      case 'checking':
        return 'Checking domain availability...';
      case 'creating':
        return 'Creating your domain...';
      default:
        return '';
    }
  };

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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label 
              htmlFor="name" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Domain Name
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="My Gallery"
              disabled={isLoading}
              required
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-600">{errors.name}</p>
            )}
          </div>

          <div>
            <label 
              htmlFor="adminEmail" 
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Admin Email
            </label>
            <input
              id="adminEmail"
              type="email"
              value={formData.adminEmail}
              onChange={(e) => handleInputChange('adminEmail', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.adminEmail ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="admin@mygallery.com"
              disabled={isLoading}
              required
            />
            {errors.adminEmail && (
              <p className="mt-1 text-sm text-red-600">{errors.adminEmail}</p>
            )}
          </div>

          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-600">{errors.general}</p>
            </div>
          )}

          {(step !== 'form') && (
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
            {isLoading ? 'Processing...' : 'Register Domain'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            By registering, you agree to our terms of service
          </p>
        </div>
      </div>
    </div>
  );
}
