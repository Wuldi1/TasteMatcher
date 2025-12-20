import { Injectable, NotFoundException, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { User, CosmosService, VectorizationService, BlobService, getTemporaryBlobPath, getTemporaryBlobFolder } from '@tastematcher/common';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateQuestionnaireDto } from './dto/update-questionnaire.dto';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';
import { ArtworksService } from '../artworks/artworks.service';
import { AuthenticatedUser } from '../auth/types/authenticated-request.interface';

// Helper interface until common package is updated
interface ExtendedPersonalQuestionnaire {
    aestheticAdmiration?: {
        description?: string;
        imageUrls?: string[];
    };
    [key: string]: any;
}

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);
    private readonly cosmosService: CosmosService;
    private readonly vectorizationService: VectorizationService;
    private readonly blobService: BlobService;

    constructor(private readonly emailService: EmailService, private readonly artworksService: ArtworksService) {
        this.cosmosService = new CosmosService();
        this.vectorizationService = new VectorizationService();
        this.blobService = new BlobService();
    }

    /**
     * Get all users in a domain
     */
    async findAllInDomain(domainId: string, askingUser: AuthenticatedUser, withStats: boolean = false): Promise<User[]> {
        const container = await this.cosmosService.getContainer('Core');

        try {
            let query = {
                query: "SELECT * FROM c WHERE c.domainId = @domainId AND c.type = 'user' ORDER BY c.createdAt DESC",
                parameters: [{ name: '@domainId', value: domainId }],
            };

            // If the user is a dealer, filter by invitedBy and role
            if (askingUser?.role === 'dealer') {
                query = {
                    query: "SELECT * FROM c WHERE c.domainId = @domainId AND c.type = 'user' AND c.invitedBy = @invitedBy AND c.role = @role ORDER BY c.createdAt DESC",
                    parameters: [
                        { name: '@domainId', value: domainId },
                        { name: '@invitedBy', value: askingUser.id },
                        { name: '@role', value: 'customer' },
                    ],
                };
            }

            const { resources } = await container.items.query<User>(query).fetchAll();

            if (withStats) {
                // Fetch swipe counts for all users in parallel
                await Promise.all(
                    resources.map(async (user) => {
                        const numberOfSwipes = await this.artworksService
                            .getStats(domainId, user.id)
                            .then((stats) => stats.totalSwiped);
                        user.swipeCount = numberOfSwipes;
                    }),
                );
            }

            this.logger.log(`Fetched ${resources.length} users for domain ${domainId}`);
            return resources;
        } catch (error) {
            this.logger.error(`Failed to fetch users for domain ${domainId}`, error);
            throw error;
        }
    }

    /**
     * Get a single user by ID
     */
    async findOne(domainId: string, userId: string, withStats: boolean = false): Promise<User> {
        const container = await this.cosmosService.getContainer('Core');

        try {
            const { resource } = await container.item(userId, domainId).read<User>();

            if (!resource) {
                throw new NotFoundException(`User ${userId} not found`);
            }
            
            if (withStats) {
                const numberOfSwipes = await this.artworksService.getStats(domainId, userId).then(stats => stats.totalSwiped);
                resource.swipeCount = numberOfSwipes;
            }
            
            this.logger.log(`Fetched user ${userId} from domain ${domainId}`);
            return resource;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to fetch user ${userId}`, error);
            throw new NotFoundException(`User ${userId} not found`);
        }
    }

    /**
     * Update user information (name and/or role only)
     */
    async update(
        domainId: string,
        userId: string,
        updateDto: UpdateUserDto,
        requestingUserId: string,
    ): Promise<User> {
        const container = await this.cosmosService.getContainer('Core');

        try {
            const user = await this.findOne(domainId, userId);

            // Prevent modifying domain owners
            if (user.role === 'domain_owner') {
                throw new ForbiddenException('Cannot modify domain owner accounts');
            }

            const { resource } = await container.item(userId, domainId).patch([
                { op: 'replace', path: '/name', value: updateDto.name ?? user.name },
                { op: 'replace', path: '/role', value: updateDto.role ?? user.role },
                { op: 'replace', path: '/updatedAt', value: Date.now() }
            ]);

            this.logger.log(`Updated user ${userId} in domain ${domainId}`);
            return resource as User;
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof ForbiddenException) {
                throw error;
            }
            this.logger.error(`Failed to update user ${userId}, on domain ${domainId}`, error);
            throw error;
        }
    }

    /**
     * Add a comment to a user's profile
     */
    async addComment(
        domainId: string,
        userId: string,
        text: string,
        authorUser: AuthenticatedUser
    ): Promise<User> {
        const container = await this.cosmosService.getContainer('Core');

        try {
            const user = await this.findOne(domainId, userId);

            // Determine author name
            const authorName = authorUser.email || 'Unknown';

            const newComment = {
                author: authorName,
                text: text,
                createdAt: Date.now(),
            };

            const currentComments = user.comments || [];
            const updatedComments = [...currentComments, newComment];

            const { resource } = await container.item(userId, domainId).patch([
                { op: 'add', path: '/comments', value: updatedComments },
                { op: 'replace', path: '/updatedAt', value: Date.now() }
            ]);

            this.logger.log(`Added comment to user ${userId}`);
            return resource as User;
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to add comment to user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Delete a user and all their preferences
     */
    async remove(domainId: string, userId: string, requestingUserId: string): Promise<void> {
        const usersContainer = await this.cosmosService.getContainer('Core');
        const preferencesContainer = await this.cosmosService.getContainer('ArtworkPreferences');

        try {
            const user = await this.findOne(domainId, userId);

            // Prevent users from deleting themselves
            if (userId === requestingUserId) {
                throw new BadRequestException('You cannot delete your own account');
            }

            // Prevent deleting domain owners
            if (user.role === 'domain_owner') {
                throw new ForbiddenException('Cannot delete domain owner accounts');
            }

            // Delete all user preferences
            const preferencesQuery = {
                query: 'SELECT * FROM c WHERE c.userId = @userId',
                parameters: [{ name: '@userId', value: userId }],
            };

            const { resources: preferences } = await preferencesContainer.items
                .query(preferencesQuery, { partitionKey: userId })
                .fetchAll();

            // Delete preferences in parallel
            await Promise.all(
                preferences.map(pref =>
                    preferencesContainer.item(pref.id, userId).delete()
                )
            );

            this.logger.log(`Deleted ${preferences.length} preferences for user ${userId}`);

            // Delete the user
            await usersContainer.item(userId, domainId).delete();

            this.logger.log(`Deleted user ${userId} from domain ${domainId}`);
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException || error instanceof ForbiddenException) {
                throw error;
            }
            this.logger.error(`Failed to delete user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Invite a new user to the domain
     * Creates user with pending_verification status and sends invitation email
     */
    async inviteUser(
        domainId: string,
        inviteDto: InviteUserDto,
        invitedById: string,
    ): Promise<User> {
        const container = await this.cosmosService.getContainer('Core');
        const normalizedEmail = inviteDto.email.toLowerCase();

        try {
            // First, ensure this email isn't used in any other domain
            const crossDomainQuery = {
                query: "SELECT TOP 1 c.id, c.domainId FROM c WHERE c.type = 'user' AND c.email = @email",
                parameters: [{ name: '@email', value: normalizedEmail }],
            };

            const { resources: crossDomainMatch } = await container.items
                .query(crossDomainQuery)
                .fetchAll();

            const matchInAnotherDomain = crossDomainMatch.find((user) => user.domainId !== domainId);
            if (matchInAnotherDomain) {
                throw new BadRequestException(`User with email ${inviteDto.email} already exists in another domain`);
            }

            // Check if user with this email already exists in the domain
            const existingQuery = {
                query: "SELECT * FROM c WHERE c.domainId = @domainId AND c.email = @email AND c.type = 'user'",
                parameters: [
                    { name: '@domainId', value: domainId },
                    { name: '@email', value: normalizedEmail },
                ],
            };

            const { resources: existing } = await container.items.query(existingQuery).fetchAll();

            if (existing.length > 0) {
                if (existing[0].status === 'pending_verification') {
                    // Send invitation email
                    await this.emailService.sendUserInvitation(
                        inviteDto.email,
                        inviteDto.name,
                        domainId,
                        inviteDto.role,
                    );

                    this.logger.log(`Sent invitation email to ${inviteDto.email}`);
                    return existing[0];
                }

                throw new BadRequestException(`User with email ${inviteDto.email} already exists in this domain`);
            }

            // Create new user with pending_verification status
            const newUser: User & { type: string } = {
                id: uuidv4(),
                domainId,
                type: 'user',
                email: normalizedEmail,
                name: inviteDto.name,
                role: inviteDto.role,
                status: 'pending_verification',
                onboardingStatus: 'not_started',
                invitedBy: invitedById,
                preferenceVector: new Array(1024).fill(0), // Initialize with zero vector
                comments: [],
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            const { resource } = await container.items.create(newUser);

            this.logger.log(`Created new user ${newUser.id} in domain ${domainId} with status pending_verification`);

            // Send invitation email
            await this.emailService.sendUserInvitation(
                inviteDto.email,
                inviteDto.name,
                domainId,
                inviteDto.role,
            );

            this.logger.log(`Sent invitation email to ${inviteDto.email}`);

            return resource as User;
        } catch (error) {
            if (error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to invite user to domain ${domainId}`, error);
            throw error;
        }
    }

    /**
     * Update user's personal questionnaire
     */
    async updateQuestionnaire(
        userId: string,
        domainId: string,
        questionnaireDto: UpdateQuestionnaireDto,
    ): Promise<User> {

        try {
            const container = await this.cosmosService.getContainer('Core');

            // Fetch the user
            const { resource: user } = await container.item(userId, domainId).read<User>();

            if (!user) {
                throw new NotFoundException(`User ${userId} not found`);
            }

            // Update questionnaire data
            const updatedUser: User = {
                ...user,
                personalQuestionnaire: {
                    ...user.personalQuestionnaire,
                    ...questionnaireDto.personalQuestionnaire,
                },
                onboardingStatus: 'in_progress',
                updatedAt: Date.now(),
            };

            const { resource: result } = await container
                .item(userId, domainId)
                .replace(updatedUser);

            this.logger.log(`Updated questionnaire for user ${userId}`);
            return result as User;

        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to update questionnaire for user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Mark user's onboarding as completed
     */
    async completeOnboarding(userId: string, domainId: string): Promise<User> {

        try {
            const container = await this.cosmosService.getContainer('Core');

            // patch specifically to set onboardingStatus to completed and completedAt timestamp
            const { resource } = await container.item(userId, domainId).patch([
                { op: 'set', path: '/onboardingStatus', value: 'completed' },
                { op: 'set', path: '/personalQuestionnaire/completedAt', value: Date.now() },
                { op: 'replace', path: '/updatedAt', value: Date.now() }
            ]);

            this.logger.log(`Completed onboarding for user ${userId}`);
            return resource;

        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to complete onboarding for user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Skip user's onboarding (can be resumed on next login)
    */
    async skipOnboarding(userId: string, domainId: string): Promise<User> {

        try {
            const container = await this.cosmosService.getContainer('Core');

            // Patch specifically to set onboardingStatus to skipped
            const { resource } = await container.item(userId, domainId).patch([
                { op: 'set', path: '/onboardingStatus', value: 'skipped' },
                { op: 'replace', path: '/updatedAt', value: Date.now() }
            ]);

            this.logger.log(`Skipped onboarding for user ${userId}`);
            return resource;

        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to skip onboarding for user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Upload and vectorize a single preference image
     * Images are uploaded to temporary blob storage and then vectorized
     */
    async vectorizePreferenceImage(
        userId: string,
        domainId: string,
        // eslint-disable-next-line
        file: Express.Multer.File,
        section: 'aesthetic' | 'collection' | 'shared_gallery' = 'aesthetic',
    ): Promise<{ success: boolean; message: string; vectorized: number }> {
        const container = await this.cosmosService.getContainer('Core');
        const correlationId = uuidv4();

        try {
            // Fetch the user
            const { resource: user } = await container.item(userId, domainId).read<User>();

            if (!user) {
                throw new NotFoundException(`User ${userId} not found`);
            }

            // Validate file using BlobService
            this.blobService.validateImageFile(file);

            // Generate unique blob name for permanent storage
            // Format: originals/[domain_id]/personal/[user_id]/[guid].jpeg
            const guid = uuidv4();
            const extension = file.mimetype.split('/')[1] || 'jpeg';
            const blobName = `${domainId}/personal/${userId}/${guid}.${extension}`;

            this.logger.log(`Uploading preference image to blob: ${blobName}`);

            // Upload to blob storage (originals container)
            const blobUrl = await this.blobService.uploadBlob(
                'originals',
                blobName,
                file.buffer,
                file.mimetype,
            );

            this.logger.log(`Image uploaded to blob storage: ${blobUrl}`);

            // Generate embedding vector using VectorizationService
            this.logger.log(`Generating embedding for image: ${blobName}`);
            const embedding = await this.vectorizationService.generateEmbedding(blobUrl, correlationId);

            if (!embedding || embedding.vector.length === 0) {
                throw new BadRequestException('Failed to generate embedding for image');
            }

            this.logger.log(`Generated embedding vector with ${embedding.vector.length} dimensions`);

            // Store the vector URL in user's aestheticAdmiration
            const updatedUser: User = {
                ...user,
                personalQuestionnaire: {
                    ...user.personalQuestionnaire,
                },
                tempPreferenceVectors: [
                    ...(user.tempPreferenceVectors || []),
                    embedding.vector,
                ],
                updatedAt: Date.now(),
            };

            let resultingCount = 0;

            if (section === 'shared_gallery') {
                const sharedUploads = [...(user.sharedCollectionUploads ?? []), blobUrl];
                updatedUser.sharedCollectionUploads = sharedUploads;
                resultingCount = sharedUploads.length;
            } else if (section === 'collection') {
                const currentCollection = user.personalQuestionnaire?.personalCollection || {};
                const collectionImages = [...(currentCollection.imageUrls ?? []), blobUrl];
                updatedUser.personalQuestionnaire = {
                    ...updatedUser.personalQuestionnaire,
                    personalCollection: {
                        ...currentCollection,
                        imageUrls: collectionImages,
                    },
                };
                resultingCount = collectionImages.length;
            } else {
                const currentAdmiration = user.personalQuestionnaire?.aestheticAdmiration || {};
                const admirationImages = [...(currentAdmiration.imageUrls ?? []), blobUrl];
                updatedUser.personalQuestionnaire = {
                    ...updatedUser.personalQuestionnaire,
                    aestheticAdmiration: {
                        ...currentAdmiration,
                        imageUrls: admirationImages,
                    },
                };
                resultingCount = admirationImages.length;
            }

            await container.item(userId, domainId).replace(updatedUser);

            this.logger.log(`Processed preference image ${resultingCount} for user ${userId}`);

            return {
                success: true,
                message: `Successfully processed preference image ${resultingCount}`,
                vectorized: resultingCount,
            };
        } catch (error) {
            if (error instanceof NotFoundException || error instanceof BadRequestException) {
                throw error;
            }
            this.logger.error(`Failed to vectorize preference image for user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Finalize preference vectors by averaging all uploaded images
     * Call this after all preference images have been uploaded
     */
    async finalizePreferenceVectors(
        userId: string,
        domainId: string,
    ): Promise<{ success: boolean; message: string; totalVectors: number }> {
        const container = await this.cosmosService.getContainer('Core');

        try {
            // Fetch the user
            const { resource: user } = await container.item(userId, domainId).read<User>();

            if (!user) {
                throw new NotFoundException(`User ${userId} not found`);
            }

            const tempVectors = user.tempPreferenceVectors || [];

            if (tempVectors.length === 0) {
                this.logger.warn(`No temporary vectors found for user ${userId}`);
                return {
                    success: true,
                    message: 'No preference images to process',
                    totalVectors: 0,
                };
            }

            this.logger.log(`Finalizing ${tempVectors.length} preference vectors for user ${userId}`);

            // Average all vectors to create final preference vector
            const vectorDimensions = tempVectors[0].length;
            const averagedVector = new Array(vectorDimensions).fill(0);

            for (const vector of tempVectors) {
                for (let i = 0; i < vectorDimensions; i++) {
                    averagedVector[i] += vector[i];
                }
            }

            // Divide by number of vectors to get average
            for (let i = 0; i < vectorDimensions; i++) {
                averagedVector[i] /= tempVectors.length;
            }

            // Normalize the vector (L2 normalization)
            const magnitude = Math.sqrt(
                averagedVector.reduce((sum, val) => sum + val * val, 0),
            );

            const normalizedVector = averagedVector.map(val =>
                magnitude > 0 ? val / magnitude : 0
            );

            this.logger.log(`Normalized preference vector for user ${userId}`);

            // Update user's final preference vector and clear temp data
            const updatedUser: User = {
                ...user,
                preferenceVector: normalizedVector,
                tempPreferenceVectors: undefined, // Clear temporary vectors
                updatedAt: Date.now(),
            };

            await container.item(userId, domainId).replace(updatedUser);

            this.logger.log(
                `Finalized preference vector for user ${userId} from ${tempVectors.length} images`,
            );

            return {
                success: true,
                message: `Successfully processed ${tempVectors.length} preference images`,
                totalVectors: tempVectors.length,
            };
        } catch (error) {
            if (error instanceof NotFoundException) {
                throw error;
            }
            this.logger.error(`Failed to finalize preference vectors for user ${userId}`, error);
            throw error;
        }
    }
}
