import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { apiClient } from '../../utils/api';
import { PersonalQuestionnaire } from '@tastematcher/common';
import { ArrowRight, ArrowLeft, Upload, CheckCircle, Loader2 } from 'lucide-react';

export function OnboardingPage() {
    const { user, refreshUser } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const derivedInitialStep = useMemo(() => {
        const params = new URLSearchParams(location.search);
        const parsed = Number(params.get('step'));
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 7) {
            return parsed;
        }
        return 1;
    }, [location.search]);
    const [step, setStep] = useState(derivedInitialStep);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadingTarget, setUploadingTarget] = useState<'aesthetic' | 'collection' | null>(null);
    
    const [formData, setFormData] = useState<PersonalQuestionnaire>({
        collectionType: 'individual',
        decisionMakersDescription: '',
        aboutYourself: '',
        currentLocation: '',
        hasOtherResidences: false,
        otherResidencesDescription: '',
        collectionGoals: '',
        hasPersonalCollection: undefined,
        personalCollection: {
            description: '',
            imageUrls: []
        },
        worksWithDesigner: undefined,
        designerDetails: '',
        aestheticAdmiration: {
            description: '',
            imageUrls: []
        }
    });

    useEffect(() => {
        setStep(derivedInitialStep);
    }, [derivedInitialStep]);

    useEffect(() => {
        if (user?.personalQuestionnaire) {
            setFormData(prev => ({
                ...prev,
                ...user.personalQuestionnaire,
                personalCollection: {
                    description: user.personalQuestionnaire?.personalCollection?.description || '',
                    imageUrls: user.personalQuestionnaire?.personalCollection?.imageUrls || []
                },
                aestheticAdmiration: {
                    description: user.personalQuestionnaire?.aestheticAdmiration?.description || '',
                    imageUrls: user.personalQuestionnaire?.aestheticAdmiration?.imageUrls || []
                }
            }));
        }
    }, [user]);

    const updateFormData = (updates: Partial<PersonalQuestionnaire>) => {
        setFormData(prev => ({ ...prev, ...updates }));
    };

    const updateAesthetic = (updates: Partial<{ description: string; imageUrls: string[] }>) => {
        setFormData(prev => ({
            ...prev,
            aestheticAdmiration: {
                ...prev.aestheticAdmiration,
                ...updates
            }
        }));
    };

    const updatePersonalCollection = (updates: Partial<{ description: string; imageUrls: string[] }>) => {
        setFormData(prev => ({
            ...prev,
            personalCollection: {
                ...prev.personalCollection,
                ...updates
            }
        }));
    };

    const handleNext = async () => {
        // Save progress on each step
        try {
            await apiClient.updateQuestionnaire({ personalQuestionnaire: formData });
            if (step < 7) {
                setStep(step + 1);
            } else {
                await handleComplete();
            }
        } catch (error) {
            console.error('Failed to save progress', error);
        }
    };

    const handleBack = () => {
        if (step > 1) setStep(step - 1);
    };

    const handleComplete = async () => {
        setIsSubmitting(true);
        try {
            // Finalize vectors if images were uploaded
            if (
                (formData.aestheticAdmiration?.imageUrls?.length ?? 0) > 0 ||
                (formData.personalCollection?.imageUrls?.length ?? 0) > 0
            ) {
                await apiClient.finalizePreferenceVectors();
            }
            await apiClient.completeOnboarding();
            await refreshUser();
            navigate('/taster');
        } catch (error) {
            console.error('Failed to complete onboarding', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'aesthetic' | 'collection') => {
        if (!e.target.files?.length) return;
        
        setUploadingTarget(target);
        const file = e.target.files[0];
        
        try {
            await apiClient.vectorizePreferenceImage(file, { section: target === 'collection' ? 'collection' : 'aesthetic' });
            // Refresh user to get the new image URL from backend
            const updatedUser = await refreshUser();
            
            if (target === 'collection') {
                const images = updatedUser?.personalQuestionnaire?.personalCollection?.imageUrls || [];
                updatePersonalCollection({ imageUrls: images });
            } else {
                const images = updatedUser?.personalQuestionnaire?.aestheticAdmiration?.imageUrls || [];
                updateAesthetic({ imageUrls: images });
            }
        } catch (error) {
            console.error('Failed to upload image', error);
        } finally {
            setUploadingTarget(null);
            e.target.value = '';
        }
    };

    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Decision Making</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                Are you collecting for yourself, or is consensus required among several decision-makers?
                            </label>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <button
                                    onClick={() => updateFormData({ collectionType: 'individual' })}
                                    className={`p-4 border rounded-lg text-left transition-all ${
                                        formData.collectionType === 'individual'
                                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                            : 'border-gray-200 hover:border-blue-300'
                                    }`}
                                >
                                    <span className="font-medium block">Just myself</span>
                                </button>
                                <button
                                    onClick={() => updateFormData({ collectionType: 'group' })}
                                    className={`p-4 border rounded-lg text-left transition-all ${
                                        formData.collectionType === 'group'
                                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                                            : 'border-gray-200 hover:border-blue-300'
                                    }`}
                                >
                                    <span className="font-medium block">Requires group consensus</span>
                                </button>
                            </div>
                            
                            {formData.collectionType === 'group' && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        If Others, describe who is involved:
                                    </label>
                                    <textarea
                                        value={formData.decisionMakersDescription || ''}
                                        onChange={(e) => updateFormData({ decisionMakersDescription: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="e.g. My partner and I..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">About You</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                In a few sentences, tell us about yourself:
                            </label>
                            <textarea
                                value={formData.aboutYourself || ''}
                                onChange={(e) => updateFormData({ aboutYourself: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                rows={6}
                                placeholder="Your background, interests, lifestyle..."
                            />
                        </div>
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Location</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                Where do you currently live?
                            </label>
                            <input
                                type="text"
                                value={formData.currentLocation || ''}
                                onChange={(e) => updateFormData({ currentLocation: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                placeholder="City, State/Province, Country"
                            />
                        </div>
                    </div>
                );

            case 4:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Other Residences</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                Do you own residences in any other locations?
                            </label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => updateFormData({ hasOtherResidences: true })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.hasOtherResidences === true
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    Yes
                                </button>
                                <button
                                    onClick={() => updateFormData({ hasOtherResidences: false })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.hasOtherResidences === false
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    No
                                </button>
                            </div>

                            {formData.hasOtherResidences && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        If yes, please list the city and country of any other residences you maintain:
                                    </label>
                                    <textarea
                                        value={formData.otherResidencesDescription || ''}
                                        onChange={(e) => updateFormData({ otherResidencesDescription: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="e.g. Vacation home in Aspen, USA..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 5:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Collection Goals</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                What are you hoping to achieve with your art collection?
                            </label>
                            <p className="text-xs text-gray-500">e.g., enjoyment, investment, building a legacy, decorating specific spaces</p>
                            <textarea
                                value={formData.collectionGoals || ''}
                                onChange={(e) => updateFormData({ collectionGoals: e.target.value })}
                                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                rows={5}
                            />
                        </div>
                    </div>
                );

            case 6:
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">Collaborators</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                Are you currently working with an architect or interior designer?
                            </label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => updateFormData({ worksWithDesigner: true })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.worksWithDesigner === true
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    Yes
                                </button>
                                <button
                                    onClick={() => updateFormData({ worksWithDesigner: false, designerDetails: '' })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.worksWithDesigner === false
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    No
                                </button>
                            </div>

                            {formData.worksWithDesigner && (
                                <div className="mt-4">
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        If yes, let us know who they are:
                                    </label>
                                    <textarea
                                        value={formData.designerDetails || ''}
                                        onChange={(e) => updateFormData({ designerDetails: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={3}
                                        placeholder="Name, firm, or any helpful notes..."
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                );

            case 7:
                return (
                    <div className="space-y-6" id="collection-section">
                        <h2 className="text-2xl font-bold text-gray-900">Visual References</h2>
                        <div className="space-y-4">
                            <label className="block text-sm font-medium text-gray-700">
                                Do you currently maintain an art collection?
                            </label>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => updateFormData({ hasPersonalCollection: true })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.hasPersonalCollection === true
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    Yes
                                </button>
                                <button
                                    onClick={() => updateFormData({ hasPersonalCollection: false })}
                                    className={`px-6 py-3 border rounded-lg transition-all ${
                                        formData.hasPersonalCollection === false
                                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                                            : 'border-gray-200 hover:bg-gray-50'
                                    }`}
                                >
                                    Not yet
                                </button>
                            </div>
                        </div>

                        {formData.hasPersonalCollection === true && (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        My Collection
                                    </label>
                                    <textarea
                                        value={formData.personalCollection?.description || ''}
                                        onChange={(e) => updatePersonalCollection({ description: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={4}
                                        placeholder="Tell us about your existing collection or highlight key pieces..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Upload photos of your collection
                                    </label>
                                    <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors relative">
                                        <div className="space-y-1 text-center">
                                            {uploadingTarget === 'collection' ? (
                                                <Loader2 className="mx-auto h-12 w-12 text-gray-400 animate-spin" />
                                            ) : (
                                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                            )}
                                            <div className="flex text-sm text-gray-600">
                                                <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                    <span>Upload a file</span>
                                                    <input
                                                        type="file"
                                                        className="sr-only"
                                                        accept="image/*"
                                                        onChange={(event) => handleImageUpload(event, 'collection')}
                                                        disabled={uploadingTarget !== null}
                                                    />
                                                </label>
                                                <p className="pl-1">or drag and drop</p>
                                            </div>
                                            <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                                        </div>
                                    </div>
                                    {formData.personalCollection?.imageUrls && formData.personalCollection.imageUrls.length > 0 && (
                                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {formData.personalCollection.imageUrls.map((url, idx) => (
                                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                                                    <img src={url} alt={`Collection Upload ${idx + 1}`} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {formData.hasPersonalCollection === false && (
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Aesthetic Inspiration
                                    </label>
                                    <textarea
                                        value={formData.aestheticAdmiration?.description || ''}
                                        onChange={(e) => updateAesthetic({ description: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        rows={4}
                                        placeholder="Share the designers, artists, or aesthetics that resonate with you..."
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Upload inspiration images
                                    </label>
                                    <div className="mt-2 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-lg hover:bg-gray-50 transition-colors relative">
                                        <div className="space-y-1 text-center">
                                            {uploadingTarget === 'aesthetic' ? (
                                                <Loader2 className="mx-auto h-12 w-12 text-gray-400 animate-spin" />
                                            ) : (
                                                <Upload className="mx-auto h-12 w-12 text-gray-400" />
                                            )}
                                            <div className="flex text-sm text-gray-600">
                                                <label className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500">
                                                    <span>Upload a file</span>
                                                    <input
                                                        type="file"
                                                        className="sr-only"
                                                        accept="image/*"
                                                        onChange={(event) => handleImageUpload(event, 'aesthetic')}
                                                        disabled={uploadingTarget !== null}
                                                    />
                                                </label>
                                                <p className="pl-1">or drag and drop</p>
                                            </div>
                                            <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB</p>
                                        </div>
                                    </div>
                                    {formData.aestheticAdmiration?.imageUrls && formData.aestheticAdmiration.imageUrls.length > 0 && (
                                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
                                            {formData.aestheticAdmiration.imageUrls.map((url, idx) => (
                                                <div key={idx} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                                                    <img src={url} alt={`Upload ${idx + 1}`} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mx-auto">
                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="h-2 bg-gray-200 rounded-full">
                        <div 
                            className="h-2 bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${(step / 7) * 100}%` }}
                        />
                    </div>
                    <div className="mt-2 text-sm text-gray-500 text-right">
                        Step {step} of 7
                    </div>
                </div>

                {/* Content Card */}
                <div className="bg-white shadow-sm rounded-xl p-6 sm:p-8">
                    {renderStep()}

                    <div className="mt-8 flex justify-between pt-6 border-t border-gray-100">
                        <button
                            onClick={handleBack}
                            disabled={step === 1}
                            className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                step === 1
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-700 hover:bg-gray-100'
                            }`}
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </button>
                        
                        <button
                            onClick={handleNext}
                            disabled={isSubmitting || uploadingTarget !== null}
                            className="flex items-center px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : step === 7 ? (
                                <>
                                    Complete
                                    <CheckCircle className="w-4 h-4 ml-2" />
                                </>
                            ) : (
                                <>
                                    Next
                                    <ArrowRight className="w-4 h-4 ml-2" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
