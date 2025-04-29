import { OrgRepository } from '../repositories/orgRepository';
import { S3Service } from '../services/s3Service';
import {
    Organization,
    OrganizationCreateRequest,
    createOrganization,
    OrganizationUpdateRequest,
    updateOrganization,
    UserOrganizationRelationship,
    addOrganizationAdmin,
} from '../models/Organizations';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import { logger } from '../util/logger';

export class OrgService {
    private orgRepository: OrgRepository;
    private s3Service: S3Service;

    constructor(
        orgRepository: OrgRepository = new OrgRepository(),
        s3Service: S3Service = new S3Service()
    ) {
        this.orgRepository = orgRepository;
        this.s3Service = s3Service;
    }

    async validateUrl(url: string | undefined): Promise<void> {
        if (url !== undefined && url.length !== 0) {
            try {
                new URL(url);
            } catch (error) {
                throw new AppError(`Invalid URL`, 400);
            }
        }
    }

    validateUserOrgAdmin(userOrg: UserOrganizationRelationship): boolean {
        if (userOrg.role !== `ADMIN`) {
            return false;
        }
        return true;
    }

    validateUserOrgMember(userOrg: UserOrganizationRelationship): boolean {
        return userOrg?.role != null;
    }

    async createOrg(
        createOrg: OrganizationCreateRequest,
        userId: string
    ): Promise<OrganizationCreateRequest | null> {
        try {
            await this.validateUrl(createOrg.logoUrl);

            // Change this condition to check only for name
            if (!createOrg.name) {
                throw new AppError('Organization name is required', 400);
            }

            const existingOrg = await this.findOrgByName(createOrg.name);

            if (existingOrg) {
                throw new AppError(`Organization name already in use!`, 409);
            }

            // Upload logo to S3 and get the S3 key
            const logoS3Key = await this.s3Service.uploadLogoFromUrl(
                createOrg.logoUrl,
                createOrg.name
            );

            // Get pre-signed URL for the logo
            const preSignedUrl = await this.s3Service.getLogoPreSignedUrl(logoS3Key);

            // Update the organization data with S3 key and pre-signed URL
            const organizationData = {
                ...createOrg,
                logoS3Key: logoS3Key,
                // Store the pre-signed URL in logoUrl (or consider updating your model to have both)
                logoUrl: preSignedUrl,
            };

            // Create the organization with the updated data
            const org = createOrganization(organizationData, userId);

            try {
                const createdOrg = await this.orgRepository.createOrg(org);
                return organizationData;
            } catch (error) {
                if (error instanceof AppError) {
                    throw error;
                }
                throw new AppError(
                    `Organization creation failed: DB! ${(error as Error).message}`,
                    500
                );
            }
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Organization creation failed: Model! ${(error as Error).message}`,
                500
            );
        }
    }

    async createUserAdmin(
        orgName: string,
        userId: string,
        email: string
    ): Promise<UserOrganizationRelationship | null> {
        const userAdmin = addOrganizationAdmin(orgName, userId, email);

        try {
            const createUserAdmin = await this.orgRepository.createUserAdmin(userAdmin);

            return createUserAdmin;
        } catch (error: any) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `User Organization creation failed: Model! ${(error as Error).message}`,
                500
            );
        }
    }

    async findOrgByName(name: string): Promise<Organization | null> {
        try {
            return await this.orgRepository.findOrgByName(name);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Finding Organization by ID failed! ${(error as Error).message}`,
                500
            );
        }
    }

    async findSpecificOrgByUser(
        name: string,
        userId: string
    ): Promise<UserOrganizationRelationship | null> {
        try {
            const userOrg = await this.orgRepository.findSpecificOrgByUser(name, userId);
            if (!userOrg) {
                throw new AppError(`You are NOT part of this Organization`, 401);
            }

            return userOrg;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Finding User Organization failed! ${(error as Error).message}`,
                500
            );
        }
    }

    // src/services/orgService.ts - Updated methods

    async findOrgsByUser(userId: string): Promise<Organization[] | null> {
        try {
            const results = await this.orgRepository.findOrgsByUser(userId);

            if (!results) {
                throw new AppError(`No Organizations found!`, 400);
            }

            // Generate fresh pre-signed URLs for all organization logos
            for (const org of results) {
                if (org.logoS3Key) {
                    try {
                        org.logoUrl = await this.s3Service.getLogoPreSignedUrl(org.logoS3Key);
                        logger.debug(`Refreshed logo URL for organization ${org.name} in findOrgsByUser`);
                    } catch (error) {
                        logger.error(`Error refreshing logo URL for org ${org.name || org.id}:`, error);

                        // Try to use existing URL if present
                        if (org.logoUrl) {
                            try {
                                const urlParts = new URL(org.logoUrl);
                                const s3Key = urlParts.pathname.substring(1); // Remove leading slash
                                if (s3Key) {
                                    org.logoUrl = await this.s3Service.getLogoPreSignedUrl(s3Key);
                                    logger.info(`Successfully parsed and refreshed URL from existing logoUrl for ${org.name}`);
                                }
                            } catch (parseError) {
                                logger.error(`Error parsing organization logo URL: ${parseError}`);
                                // Keep existing URL if parsing fails
                            }
                        }
                    }
                } else if (org.logoUrl) {
                    // No S3 key but URL exists - try to extract key from URL
                    try {
                        const urlParts = new URL(org.logoUrl);
                        const s3Key = urlParts.pathname.substring(1); // Remove leading slash
                        if (s3Key) {
                            try {
                                const newUrl = await this.s3Service.getLogoPreSignedUrl(s3Key);
                                org.logoUrl = newUrl;
                                logger.info(`Generated new URL from existing logoUrl for ${org.name}`);
                            } catch (urlError) {
                                logger.error(`Error refreshing URL from extracted key: ${urlError}`);
                                // Keep original URL if refresh fails
                            }
                        }
                    } catch (parseError) {
                        logger.error(`Error parsing organization logo URL: ${parseError}`);
                        // Keep original URL if parsing fails
                    }
                }
            }

            return results;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Finding Organization by User failed! ${(error as Error).message}`,
                500
            );
        }
    }

    async updateOrgByName(
        org: OrganizationUpdateRequest
    ): Promise<OrganizationUpdateRequest | null> {
        try {
            if (!org.name) {
                throw new AppError(`You need to specify the Organization name.`, 400);
            }

            await this.validateUrl(org.logoUrl);
            await this.validateUrl(org.website);

            const existingOrg = await this.orgRepository.findOrgByName(org.name);

            if (!existingOrg) {
                throw new AppError(`No Organizations found!`, 400);
            }

            const updatedOrg = updateOrganization(org, existingOrg);

            return await this.orgRepository.updateOrgByName(updatedOrg);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Updating Organization failed! ${(error as Error).message}`, 500);
        }
    }

    async findAllPublicOrgs(
        lastEvaluatedKey?: Record<string, any>
    ): Promise<{ orgs: Organization[]; newLastEvaluatedKey: Record<string, any> | null }> {
        try {
            return await this.orgRepository.findAllPublicOrgs(lastEvaluatedKey);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Updating Organization failed! ${(error as Error).message}`, 500);
        }
    }

    /**
     * Creates a user-organization relationship
     * @param userOrg The user-organization relationship to create
     * @returns The created relationship
     */
    async createUserOrganizationRelationship(
        userOrg: UserOrganizationRelationship
    ): Promise<UserOrganizationRelationship | null> {
        try {
            return await this.orgRepository.createUserAdmin(userOrg);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Failed to create user-organization relationship: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
     * Get all members of an organization
     * @param orgName The name of the organization
     * @returns Array of user-organization relationships
     */
    async getOrgMembers(orgName: string): Promise<UserOrganizationRelationship[]> {
        try {
            const members = await this.orgRepository.getOrgMembers(orgName);

            if (!members || members.length === 0) {
                throw new AppError('No members found for this organization', 404);
            }

            return members;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Failed to get organization members: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
     * Remove a member from an organization
     * @param orgName The name of the organization
     * @param userId The ID of the user to remove
     * @returns True if successful
     */
    async removeMember(orgName: string, userId: string): Promise<boolean> {
        try {
            // Check if the member exists in the organization
            const member = await this.orgRepository.findSpecificOrgByUser(orgName, userId);

            if (!member) {
                throw new AppError('Member not found in this organization', 404);
            }

            // Remove the member
            const result = await this.orgRepository.removeMember(orgName, userId);

            if (!result) {
                throw new AppError('Failed to remove member', 500);
            }

            return result;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to remove member: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Remove yourself from an organization
     * @param orgName The name of the organization
     * @param userId your userId
     * @returns True if successful
     */
    async leaveOrganization(orgName: string, userId: string): Promise<boolean> {
        try {
            const member = await this.orgRepository.findSpecificOrgByUser(orgName, userId);

            if (!member) {
                throw new AppError('Member not found in this organization', 404);
            }

            if (member.userId != userId) {
                throw new AppError('You cannot make another member leave', 403);
            }

            if (member.role === UserRole.ADMIN) {
                const orgMembers = await this.orgRepository.getOrgMembers(orgName);
                const adminCount = orgMembers.filter(
                    member => member.role === UserRole.ADMIN
                ).length;

                if (adminCount <= 1) {
                    throw new AppError(
                        'Cannot leave organization: You are the only admin. Please assign another admin first.',
                        400
                    );
                }
            }

            return await this.orgRepository.removeMember(orgName, userId);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to leave organization: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Update a member's role in an organization
     * @param orgName The name of the organization
     * @param userId The ID of the user to update
     * @param role The new role for the user
     * @returns The updated user-organization relationship
     */
    async updateMemberRole(
        orgName: string,
        userId: string,
        role: UserRole
    ): Promise<UserOrganizationRelationship> {
        try {
            // Check if the member exists in the organization
            const member = await this.orgRepository.findSpecificOrgByUser(orgName, userId);

            if (!member) {
                throw new AppError('Member not found in this organization', 404);
            }

            // Update the member's role
            const updatedMember = await this.orgRepository.updateMemberRole(orgName, userId, role);

            if (!updatedMember) {
                throw new AppError('Failed to update member role', 500);
            }

            return updatedMember;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(`Failed to update member role: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Check if a user is already a member of the organization
     * @param orgName The name of the organization
     * @param userId The ID of the user to check
     * @returns true if the user is already a member of the org
     */
    async isMemberOfOrg(orgName: string, userId: string): Promise<Boolean> {
        try {
            return (await this.orgRepository.findSpecificOrgByUser(orgName, userId)) != null;
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Failed to check if user is member of org: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
 * Creates an organization with a logo uploaded as a file
 * @param createOrgRequest The organization data
 * @param userId The ID of the user creating the organization
 * @param logoFile The logo file buffer
 * @param mimeType The mimetype of the file
 * @returns The created organization
 */
    async createOrgWithFileUpload(
        createOrgRequest: Omit<OrganizationCreateRequest, 'logoUrl'>,
        userId: string,
        logoFile: Buffer,
        mimeType: string
    ): Promise<OrganizationCreateRequest | null> {
        try {
            // Check only for name
            if (!createOrgRequest.name) {
                throw new AppError('Organization name is required', 400);
            }

            const existingOrg = await this.findOrgByName(createOrgRequest.name);

            if (existingOrg) {
                throw new AppError(`Organization name already in use!`, 409);
            }

            // Upload logo to S3 using buffer
            const logoS3Key = await this.s3Service.uploadLogoFromBuffer(
                logoFile,
                createOrgRequest.name,
                mimeType
            );

            // Get pre-signed URL for the logo
            const preSignedUrl = await this.s3Service.getLogoPreSignedUrl(logoS3Key);

            // Create the complete organization data with S3 key and pre-signed URL
            const organizationData = {
                ...createOrgRequest,
                logoUrl: preSignedUrl,
                logoS3Key: logoS3Key,
            };

            // Create the organization with the updated data
            const org = createOrganization(organizationData, userId);

            try {
                const createdOrg = await this.orgRepository.createOrg(org);
                return organizationData;
            } catch (error) {
                if (error instanceof AppError) {
                    throw error;
                }
                throw new AppError(
                    `Organization creation failed: DB! ${(error as Error).message}`,
                    500
                );
            }
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Organization creation failed: Model! ${(error as Error).message}`,
                500
            );
        }
    }

    /**
 * Updates an organization's logo with a file upload
 * @param orgName The name of the organization
 * @param logoFile The logo file buffer
 * @param mimeType The mimetype of the file
 * @returns The updated S3 key and pre-signed URL
 */
    async updateOrgLogoWithFile(
        orgName: string,
        logoFile: Buffer,
        mimeType: string
    ): Promise<{ logoUrl: string; logoS3Key: string }> {
        try {
            // Find the existing organization
            const existingOrg = await this.findOrgByName(orgName);

            if (!existingOrg) {
                throw new AppError(`Organization not found`, 404);
            }

            // Upload the new logo
            const logoS3Key = await this.s3Service.uploadLogoFromBuffer(
                logoFile,
                orgName,
                mimeType
            );

            // Get pre-signed URL for the logo
            const preSignedUrl = await this.s3Service.getLogoPreSignedUrl(logoS3Key);

            return {
                logoUrl: preSignedUrl,
                logoS3Key: logoS3Key
            };
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }
            throw new AppError(
                `Failed to update organization logo: ${(error as Error).message}`,
                500
            );
        }
    }
}
