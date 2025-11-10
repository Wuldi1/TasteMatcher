import { Injectable, NotFoundException, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { User, CosmosService } from '@tastematcher/common';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { v4 as uuidv4 } from 'uuid';
import { EmailService } from '../email/email.service';

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);
    private readonly cosmosService: CosmosService;

    constructor(private readonly emailService: EmailService) {
        this.cosmosService = new CosmosService();
    }

    /**
     * Get all users in a domain
     */
    async findAllInDomain(domainId: string): Promise<User[]> {
        const container = await this.cosmosService.getContainer('Users');

        try {
            const query = {
                query: 'SELECT * FROM c WHERE c.domainId = @domainId ORDER BY c.createdAt DESC',
                parameters: [{ name: '@domainId', value: domainId }],
            };

            const { resources } = await container.items.query<User>(query).fetchAll();

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
    async findOne(domainId: string, userId: string): Promise<User> {
        const container = await this.cosmosService.getContainer('Users');

        try {
            const { resource } = await container.item(userId, domainId).read<User>();

            if (!resource) {
                throw new NotFoundException(`User ${userId} not found`);
            }

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
        const container = await this.cosmosService.getContainer('Users');

        try {
            const user = await this.findOne(domainId, userId);

            // Prevent users from modifying themselves
            if (userId === requestingUserId) {
                throw new BadRequestException('You cannot modify your own account');
            }

            // Prevent modifying domain owners
            if (user.role === 'domain_owner') {
                throw new ForbiddenException('Cannot modify domain owner accounts');
            }

            const { resource } = await container.item(domainId, userId).patch([
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
            this.logger.error(`Failed to update user ${userId}`, error);
            throw error;
        }
    }

    /**
     * Delete a user and all their preferences
     */
    async remove(domainId: string, userId: string, requestingUserId: string): Promise<void> {
        const usersContainer = await this.cosmosService.getContainer('Users');
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
        const container = await this.cosmosService.getContainer('Users');

        try {
            // Check if user with this email already exists in the domain
            const existingQuery = {
                query: 'SELECT * FROM c WHERE c.domainId = @domainId AND c.email = @email',
                parameters: [
                    { name: '@domainId', value: domainId },
                    { name: '@email', value: inviteDto.email.toLowerCase() },
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
            const newUser: User = {
                id: uuidv4(),
                domainId,
                email: inviteDto.email.toLowerCase(),
                name: inviteDto.name,
                role: inviteDto.role,
                status: 'pending_verification',
                invitedBy: invitedById,
                preferenceVector: new Array(1024).fill(0), // Initialize with zero vector
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
}
