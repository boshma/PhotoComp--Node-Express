import { dynamoDb, TABLE_NAME } from '../config/db';
import { Photo } from '../models/Photo';
import { PutCommand, QueryCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { AppError } from '../middleware/errorHandler';

export class PhotoRepository {
    /**
     * Creates a new photo record in the database
     * @param photo The photo object to create
     * @returns The created photo
     * @throws AppError if the operation fails 
     */
    async createPhoto(photo: Photo): Promise<Photo> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: photo,
                })
            );
            return photo;
        } catch (error: any) {
            throw new AppError(`Failed to create photo record: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves a photo by its ID
     * @param photoId The ID of the photo to retrieve
     * @returns The photo record or null if not found
     * @throws AppError if the operation fails
     */
    async getPhotoById(photoId: string): Promise<Photo | null> {
        try {
            const result = await dynamoDb.send(
                new GetCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `PHOTO#${photoId}`,
                        SK: 'ENTITY',
                    },
                })
            );

            if (!result.Item) {
                return null;
            }

            return result.Item as Photo;
        } catch (error: any) {
            throw new AppError(`Failed to retrieve photo: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves all photos for a specific event
     * @param eventId The ID of the event
     * @returns A list of photos for the event
     * @throws AppError if the operation fails
     */
    async getPhotosByEvent(eventId: string): Promise<Photo[]> {
        try {
            const response = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2PK-GSI2SK-INDEX',
                    KeyConditionExpression:
                        'GSI2PK = :eventId AND begins_with(GSI2SK, :photoPrefix)',
                    ExpressionAttributeValues: {
                        ':eventId': `EVENT#${eventId}`,
                        ':photoPrefix': 'PHOTO#',
                    },
                })
            );

            // Ensure we always return an array, even if Items is undefined
            return (response.Items || []) as Photo[];
        } catch (error: any) {
            throw new AppError(`Failed to retrieve event photos: ${error.message}`, 500);
        }
    }

    /**
     * Deletes a photo from the database
     * @param photoId The ID of the photo to delete
     * @throws AppError if the operation fails
     */
    async deletePhoto(photoId: string): Promise<void> {
        try {
            await dynamoDb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `PHOTO#${photoId}`,
                        SK: 'ENTITY',
                    },
                })
            );
        } catch (error: any) {
            throw new AppError(`Failed to delete photo: ${error.message}`, 500);
        }
    }
}
