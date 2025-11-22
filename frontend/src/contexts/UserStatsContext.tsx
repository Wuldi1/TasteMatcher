import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiClient } from '../utils/api';
import { useAuth } from './AuthContext';
import type { UserStatsResponse, PersonalQuestionnaire } from '@tastematcher/common';

interface UserStatsContextValue {
    stats: UserStatsResponse | null;
    answeredQuestions: number;
    totalQuestions: number;
    isLoading: boolean;
}

const UserStatsContext = createContext<UserStatsContextValue | undefined>(undefined);

/**
 * Calculate the total number of questions in the PersonalQuestionnaire interface.
 * @returns The total number of questions.
 */
function calculateTotalQuestions(): number {
    const questionnaire: PersonalQuestionnaire = {
        personalDetails: {
            location: '',
            secondaryLocations: [],
            profession: '',
            culturalInfluences: '',
            maritalStatus: 'single',
            residences: [],
            hasChildren: false,
            numberOfChildren: 0,
            currentlyCollects: false,
            currentCollection: '',
            familyCollects: false,
        },
        collectingPreferences: {
            themes: '',
            artistsOrMovements: '',
            collectingStyle: 'conceptual',
            displayLocations: [],
            startedCollecting: '',
            firstAcquisition: '',
            evolutionOfFocus: '',
            mentorsOrAdvisors: '',
            eventsAttended: '',
            museumBoards: '',
            artistEngagement: '',
        },
        artworkPreferences: {
            description: '',
            referenceImageUrls: [],
        },
    };

    return Object.values(questionnaire).reduce((total, section) => {
        if (typeof section === 'object' && section !== null) {
            return total + Object.keys(section).length;
        }
        return total;
    }, 0);
}


/**
 * Calculate the number of answered questions in the PersonalQuestionnaire.
 * @param questionnaire - The user's personal questionnaire.
 * @returns The number of answered questions.
 */
function calculateAnsweredQuestions(questionnaire: PersonalQuestionnaire): number {
    return Object.values(questionnaire).reduce((count, section) => {
        if (typeof section === 'object' && section !== null) {
            return count + Object.values(section).filter((value) => value !== undefined && value !== null).length;
        }
        return count;
    }, 0);
}

export const UserStatsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth(); // Use the authenticated user from AuthContext
    const [stats, setStats] = useState<UserStatsResponse | null>(null);
    const [answeredQuestions, setAnsweredQuestions] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            if (!user?.id || !user?.domainId) return;

            setIsLoading(true);
            try {
                const fetchedStats = await apiClient.getUserStats();
                setStats(fetchedStats);

                // Calculate answered and total questions
                if (user.personalQuestionnaire) {
                    setAnsweredQuestions(calculateAnsweredQuestions(user.personalQuestionnaire));
                    setTotalQuestions(calculateTotalQuestions());
                }
            } catch (err) {
                console.error('Failed to fetch user stats:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchStats();
    }, [user]);

    return (
        <UserStatsContext.Provider value={{ stats, answeredQuestions, totalQuestions, isLoading }}>
            {children}
        </UserStatsContext.Provider>
    );
};

export const useUserStatsContext = (): UserStatsContextValue => {
    const context = useContext(UserStatsContext);
    if (!context) {
        throw new Error('useUserStatsContext must be used within a UserStatsProvider');
    }
    return context;
};
