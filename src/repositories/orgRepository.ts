import { dynamoDb, TABLE_NAME } from '../config/db';
import {
    Organization,
    OrganizationCreateRequest,
    UserOrganizationRelationship,
    OrganizationUpdateRequest,
    addOrganizationAdmin,
} from '../models/Organizations';

import {
    PutCommand,
    QueryCommand,
    GetCommand,
    DeleteCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { AppError } from '../middleware/errorHandler';
import { UserRole } from '../models/User';
import { S3Service } from '../services/s3Service';
import { logger } from '../util/logger';

export class OrgRepository {
    private s3Service: S3Service;

    constructor() {
        this.s3Service = new S3Service();
    }

    async createOrg(org: Organization): Promise<OrganizationCreateRequest> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: org,
                    ConditionExpression: 'attribute_not_exists(PK)',
                })
            );

            return org;
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                throw new AppError('Organization already exists!', 409);
            }
            throw new AppError(`Failed to create Organization: ${error.message}`, 500);
        }
    }

    async createUserAdmin(
        userOrg: UserOrganizationRelationship
    ): Promise<UserOrganizationRelationship | null> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: userOrg,
                })
            );

            return userOrg;
        } catch (error: any) {
            throw new AppError(`Failed to create Organization: ${error.message}`, 500);
        }
    }

    async findOrgByName(name: string): Promise<Organization | null> {
        try {
            const params = {
                TableName: TABLE_NAME,
                Key: {
                    PK: `ORG#${name.toUpperCase()}`,
                    SK: `ENTITY`,
                },
            };

            const result = await dynamoDb.send(new GetCommand(params));

            if (!result.Item) {
                return null;
            }

            // Refresh the presigned URL for the logo if an S3 key exists
            const org = result.Item as Organization;
            if (org.logoS3Key) {
                try {
                    // Generate a new pre-signed URL for the logo
                    org.logoUrl = await this.s3Service.getLogoPreSignedUrl(org.logoS3Key);
                    logger.debug(`Refreshed logo URL for organization ${org.name}`);
                } catch (error) {
                    logger.error(`Error refreshing logo URL for org ${org.name}:`, error);

                    // Try to extract key from an existing URL if available as fallback
                    if (!org.logoUrl || org.logoUrl.trim() === '') {
                        logger.warn(`No existing URL to parse for org ${org.name}`);
                    } else {
                        try {
                            const urlParts = new URL(org.logoUrl);
                            const s3Key = urlParts.pathname.substring(1); // Remove leading slash
                            org.logoUrl = await this.s3Service.getLogoPreSignedUrl(s3Key);
                            logger.info(`Successfully parsed and refreshed URL from existing logoUrl for ${org.name}`);
                        } catch (parseError) {
                            logger.error(`Error parsing organization logo URL for ${org.name}: ${parseError}`);
                            // At this point, we've tried everything - just keep existing URL
                        }
                    }
                }
            } else if (org.logoUrl) {
                // No S3 key but URL exists - try to extract key from URL and update the record
                try {
                    const urlParts = new URL(org.logoUrl);
                    const s3Key = urlParts.pathname.substring(1); // Remove leading slash

                    if (s3Key) {
                        try {
                            // Generate a fresh pre-signed URL
                            const newUrl = await this.s3Service.getLogoPreSignedUrl(s3Key);

                            // Update the organization object
                            org.logoUrl = newUrl;
                            org.logoS3Key = s3Key; // Save the extracted key for future use

                            // Optionally update the database record with the extracted S3 key
                            this.updateOrgLogoS3Key(name, s3Key).catch(err => {
                                logger.error(`Failed to update organization record with extracted S3 key: ${err.message}`);
                            });

                            logger.info(`Extracted S3 key from URL and refreshed for org ${org.name}`);
                        } catch (urlError) {
                            logger.error(`Error generating pre-signed URL from extracted key for org ${org.name}: ${urlError}`);
                            // Keep original URL if regeneration fails
                        }
                    }
                } catch (parseError) {
                    logger.error(`Error parsing organization logo URL for ${org.name}: ${parseError}`);
                    // Keep original URL if parsing fails
                }
            }

            return org;
        } catch (error: any) {
            throw new AppError(`Failed to find organization by name: ${error.message}`, 500);
        }
    }

    // Helper method to update organization record with extracted S3 key
    private async updateOrgLogoS3Key(orgName: string, s3Key: string): Promise<void> {
        try {
            await dynamoDb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `ORG#${orgName.toUpperCase()}`,
                        SK: 'ENTITY',
                    },
                    UpdateExpression: 'SET logoS3Key = :logoS3Key',
                    ExpressionAttributeValues: {
                        ':logoS3Key': s3Key
                    }
                })
            );
            logger.info(`Updated organization ${orgName} record with extracted S3 key`);
        } catch (error) {
            // Just log the error but don't fail the main operation
            logger.error(`Failed to update organization with extracted S3 key: ${(error as Error).message}`);
        }
    }

    async findSpecificOrgByUser(
        name: string,
        userId: string
    ): Promise<UserOrganizationRelationship | null> {
        try {
            const params = {
                TableName: TABLE_NAME,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `ORG#${name.toUpperCase()}`,
                },
            };

            const result = await dynamoDb.send(new GetCommand(params));

            if (!result.Item) {
                return null;
            }

            return result.Item as UserOrganizationRelationship;
        } catch (error: any) {
            throw new AppError(`Failed to find organization by name: ${error.message}`, 500);
        }
    }

    async findOrgsByUser(userId: string): Promise<Organization[] | null> {
        try {
            const params = {
                TableName: TABLE_NAME,
                KeyConditionExpression: 'PK = :userIdKey and begins_with(SK, :orgName)',
                ExpressionAttributeValues: {
                    ':userIdKey': `USER#${userId}`,
                    ':orgName': `ORG#`,
                },
            };

            const result = await dynamoDb.send(new QueryCommand(params));

            if (!result.Items || result.Items.length === 0) {
                return [];
            }

            // Generate fresh pre-signed URLs for all organization logos
            const orgs = result.Items as Organization[];
            for (const org of orgs) {
                if (org.logoS3Key) {
                    try {
                        // Generate a new pre-signed URL for the logo
                        org.logoUrl = await this.s3Service.getLogoPreSignedUrl(org.logoS3Key);
                        logger.debug(`Refreshed logo URL for organization ${org.name} in findOrgsByUser`);
                    } catch (error) {
                        // Log the error but continue processing other organizations
                        logger.error(`Error refreshing logo URL for org ${org.name || org.id}:`, error);
                        // If we can't generate a new URL, at least keep the existing one
                    }
                }
            }

            return orgs;
        } catch (error: any) {
            throw new AppError(`Failed to find organization by id: ${error.message}`, 500);
        }
    }

    async updateOrgByName(org: Organization): Promise<OrganizationUpdateRequest | null> {
        try {
            const updateExpressions = [];
            const expressionAttributeNames: Record<string, string> = {};
            const expressionAttributeValues: Record<string, any> = {};

            if (org.description !== undefined && org.description.trim() !== '') {
                updateExpressions.push('#description = :description');
                expressionAttributeNames['#description'] = 'description';
                expressionAttributeValues[':description'] = org.description;
            }

            if (org.logoUrl !== undefined && org.logoUrl.trim() !== '') {
                updateExpressions.push('logoUrl = :logoUrl');
                expressionAttributeValues[':logoUrl'] = org.logoUrl;
            }

            if (org.website !== undefined && org.website.trim() !== '') {
                updateExpressions.push('website = :website');
                expressionAttributeValues[':website'] = org.website;
            }

            if (org.contactEmail !== undefined && org.contactEmail.trim() !== '') {
                updateExpressions.push('contactEmail = :contactEmail');
                expressionAttributeValues[':contactEmail'] = org.contactEmail;
            }

            if (updateExpressions.length === 0) {
                throw new AppError('No valid fields provided to update', 400);
            }

            const updatedOrg = await dynamoDb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: org.PK,
                        SK: org.SK,
                    },
                    UpdateExpression: 'SET ' + updateExpressions.join(', '),
                    ExpressionAttributeNames: expressionAttributeNames,
                    ExpressionAttributeValues: expressionAttributeValues,
                    ReturnValues: 'ALL_NEW',
                })
            );

            if (!updatedOrg.Attributes) {
                throw new AppError('Organization not updated', 400);
            }

            return org;
        } catch (error: any) {
            throw new AppError(`Failed to update organization: ${error.message}`, 500);
        }
    }


    async findAllPublicOrgs(
        lastEvaluatedKey?: Record<string, any>
    ): Promise<{ orgs: Organization[]; newLastEvaluatedKey: Record<string, any> | null }> {
        try {
            const queryParams: any = {
                TableName: TABLE_NAME,
                IndexName: 'GSI1PK-GSI1SK-INDEX',
                KeyConditionExpression: 'GSI1PK = :orgKey and begins_with(GSI1SK, :orgName)',
                ExpressionAttributeValues: {
                    ':orgKey': `ORG`,
                    ':orgName': `ORG#`,
                },
                Limit: 9,
            };

            if (lastEvaluatedKey &&
                lastEvaluatedKey.PK &&
                lastEvaluatedKey.SK &&
                lastEvaluatedKey.GSI1PK &&
                lastEvaluatedKey.GSI1SK) {
                queryParams.ExclusiveStartKey = lastEvaluatedKey;
            }

            const result: any = await dynamoDb.send(new QueryCommand(queryParams));

            // Generate fresh presigned URLs for all organization logos
            const orgs = result.Items as Organization[];
            for (const org of orgs) {
                if (org.logoS3Key) {
                    try {
                        // Generate a new pre-signed URL for the logo
                        org.logoUrl = await this.s3Service.getLogoPreSignedUrl(org.logoS3Key);
                        logger.debug(`Refreshed logo URL for organization ${org.name} in findAllPublicOrgs`);
                    } catch (error) {
                        // Log the error but continue processing other organizations
                        logger.error(`Error refreshing logo URL for org ${org.name || org.id}:`, error);
                        // If we can't generate a new URL, at least keep the existing one
                    }
                }
            }

            return {
                orgs: orgs,
                newLastEvaluatedKey: result.LastEvaluatedKey || null
            };
        } catch (error: any) {
            console.error("findAllPublicOrgs error:", error);
            throw new AppError(`Failed to find organizations: ${error.message}`, 500);
        }
    }

    /**
     * Get all members of an organization
     * @param orgName The name of the organization
     * @returns Array of user-organization relationships
     */
    async getOrgMembers(orgName: string): Promise<UserOrganizationRelationship[]> {
        try {
            const result = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI1PK-GSI1SK-INDEX',
                    KeyConditionExpression: 'GSI1PK = :orgKey AND begins_with(GSI1SK, :userPrefix)',
                    ExpressionAttributeValues: {
                        ':orgKey': `ORG#${orgName.toUpperCase()}`,
                        ':userPrefix': 'USER#',
                    },
                })
            );

            if (!result.Items || result.Items.length === 0) {
                return [];
            }

            return result.Items as UserOrganizationRelationship[];
        } catch (error: any) {
            throw new AppError(`Failed to get organization members: ${error.message}`, 500);
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
            await dynamoDb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `USER#${userId}`,
                        SK: `ORG#${orgName.toUpperCase()}`,
                    },
                })
            );
            return true;
        } catch (error: any) {
            throw new AppError(`Failed to remove member: ${error.message}`, 500);
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
            const now = new Date().toISOString();

            const result = await dynamoDb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `USER#${userId}`,
                        SK: `ORG#${orgName.toUpperCase()}`,
                    },
                    UpdateExpression: 'SET #role = :role, updatedAt = :updatedAt',
                    ExpressionAttributeNames: {
                        '#role': 'role',
                    },
                    ExpressionAttributeValues: {
                        ':role': role,
                        ':updatedAt': now,
                    },
                    ReturnValues: 'ALL_NEW',
                })
            );

            if (!result.Attributes) {
                throw new AppError('Member not found', 404);
            }

            return result.Attributes as UserOrganizationRelationship;
        } catch (error: any) {
            throw new AppError(`Failed to update member role: ${error.message}`, 500);
        }
    }
}