import { dynamoDb, TABLE_NAME } from '../config/db';
import { Event, EventUser } from '../models/Event';
import {
    PutCommand,
    QueryCommand,
    GetCommand,
    DeleteCommand,
    UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { QueryCommandOutput } from '@aws-sdk/client-dynamodb'; // Import this

import { AppError } from '../middleware/errorHandler';
import { WeatherData } from '@/services/weatherService';

/**
 * Repository class for handling event-related database operations.
 */
export class EventRepository {
    /**
     * Creates a new event in the database.
     *
     * @param event - The event object to be stored.
     * @returns The created event.
     * @throws {AppError} If the database operation fails.
     */
    async createOrgEvent(event: Event): Promise<Event> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: event,
                })
            );
            return event;
        } catch (error: any) {
            throw new AppError(`Failed to create event: ${error.message}`, 500);
        }
    }

    /**
     * Creates a record for a user attending an event.
     *
     * @param eventUser - The event attendance record to be stored.
     * @returns The created event attendance record.
     * @throws {AppError} If the database operation fails.
     */
    async addAttendingEventRecord(eventUser: EventUser): Promise<EventUser> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: eventUser,
                })
            );

            return eventUser;
        } catch (error: any) {
            throw new AppError(`Failed to add event attendance record: ${error.message}`, 500);
        }
    }

    /**
     * Removes a record for a user attending an event.
     *
     * @param eventUser - The event attendance record to be stored.
     * @returns True if successfull
     * @throws {AppError} If the database operation fails.
     */
    async removeAttendingEventRecord(userID: string, eventID: string): Promise<Boolean> {
        try {
            await dynamoDb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `USER#${userID}`,
                        SK: `EVENT#${eventID}`,
                    },
                })
            );

            return true;
        } catch (error: any) {
            throw new AppError(`Failed to add event attendance record: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves all events for a specific organization.
     *
     * @param orgID - The ID of the organization.
     * @returns A list of events belonging to the organization.
     * @throws {AppError} If the database operation fails.
     */
    async getOrgEvents(orgID: string): Promise<Event[]> {
        try {
            // Query events using the GSI2 index, filtering by organization ID.
            const response = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2PK-GSI2SK-INDEX',
                    KeyConditionExpression: 'GSI2PK = :orgId AND begins_with(GSI2SK, :eventPrefix)',
                    ExpressionAttributeValues: {
                        ':orgId': `ORG#${orgID.toUpperCase()}`,
                        ':eventPrefix': `EVENT#`,
                    },
                })
            );
            // Use a safer type assertion
            return (response.Items as unknown as Event[]) || [];
        } catch (error: any) {
            throw new AppError(`Failed to retrieve events: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves a specific event for an organization.
     *
     * @param orgID - The ID of the organization.
     * @param eventID - The ID of the event.
     * @returns The requested event.
     * @throws {AppError} If the database operation fails.
     */
    async getOrgEvent(orgID: string, eventID: string): Promise<Event> {
        try {
            // Query for a specific event using the GSI2 index.
            const response = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2PK-GSI2SK-INDEX',
                    KeyConditionExpression: 'GSI2PK = :orgID AND GSI2SK = :eventID',
                    ExpressionAttributeValues: {
                        ':orgID': `ORG#${orgID}`,
                        ':eventID': `EVENT#${eventID}`,
                    },
                })
            );

            const items = response.Items as Event[];
            // Use a safer type assertion
            return items[0] as unknown as Event; // Return the first (and expected only) result.
        } catch (error: any) {
            throw new AppError(`Failed to retrieve event: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves all events that a specific user is attending.
     *
     * @param userID - The ID of the user.
     * @returns A list of events the user is attending.
     * @throws {AppError} If the database operation fails.
     */
    async getUserEvents(userID: string): Promise<Event[]> {
        try {
            // Query user-related events using their primary key.
            const response = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    KeyConditionExpression: 'PK = :userPK AND begins_with(SK, :skPrefix)',
                    ExpressionAttributeValues: {
                        ':userPK': `USER#${userID}`,
                        ':skPrefix': 'EVENT#',
                    },
                })
            );
            // Use a safer type assertion
            return (response.Items as unknown as Event[]) || [];
        } catch (error: any) {
            throw new AppError(`Failed to retrieve user events: ${error.message}`, 500);
        }
    }

    /**
     * Retrieves all events for a specific organization.
     *
     * @param orgID - The ID of the organization.
     * @returns A list of events belonging to the organization.
     * @throws {AppError} If the database operation fails.
     */
    async getPublicOrgEvents(
        orgID: string
    ): Promise<{ events: Event[]; newLastEvaluatedKey: Record<string, any> | null }> {
        try {
            let publicEvents: Event[] = [];
            let lastEvaluatedKey: Record<string, any> | undefined = undefined;

            // Keep querying until we have at least 9 public events or no more data
            while (publicEvents.length < 9) {
                const response: any = await dynamoDb.send(
                    new QueryCommand({
                        TableName: TABLE_NAME,
                        IndexName: 'GSI2PK-GSI2SK-INDEX',
                        KeyConditionExpression:
                            'GSI2PK = :orgId AND begins_with(GSI2SK, :eventPrefix)',
                        ExpressionAttributeValues: {
                            ':orgId': `ORG#${orgID.toUpperCase()}`,
                            ':eventPrefix': `EVENT#`,
                        },
                        Limit: 15, // Fetch more events to ensure enough public ones
                        ExclusiveStartKey: lastEvaluatedKey || undefined,
                    })
                );

                // Use a safer type assertion
                const fetchedEvents = (response.Items as unknown as Event[]) || [];
                publicEvents.push(...fetchedEvents.filter(event => event.isPublic));

                // no more data to paginate
                if (!response.LastEvaluatedKey) break;

                lastEvaluatedKey = response.LastEvaluatedKey;
            }

            return {
                events: publicEvents.slice(0, 9),
                newLastEvaluatedKey: lastEvaluatedKey || null,
            };
        } catch (error: any) {
            throw new AppError(`Failed to retrieve events: ${error.message}`, 500);
        }
    }

    async findEventUserbyUser(eventId: string, userId: string): Promise<EventUser | null> {
        try {
            const params = {
                TableName: TABLE_NAME,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `EVENT#${eventId}`,
                },
            };

            const result = await dynamoDb.send(new GetCommand(params));

            if (!result.Item) {
                return null;
            }
            // Use a safer type assertion
            return result.Item as unknown as EventUser;
        } catch (error: any) {
            throw new AppError(`Failed to find Event-User Connection: ${error.message}`, 500);
        }
    }

    async findEventById(eventId: string): Promise<Event | null> {
        try {
            const params = {
                TableName: TABLE_NAME,
                Key: {
                    PK: `EVENT#${eventId}`,
                    SK: `ENTITY`,
                },
            };

            const result = await dynamoDb.send(new GetCommand(params));

            if (!result.Item) {
                return null;
            }
            // Use a safer type assertion
            return result.Item as unknown as Event;
        } catch (error: any) {
            throw new AppError(`Failed to find Event: ${error.message}`, 500);
        }
    }

    async updateEventPublicity(event: Event): Promise<Event | null> {
        try {
            const updatedEvent = await dynamoDb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: event.PK,
                        SK: event.SK,
                    },
                    UpdateExpression: 'SET #isPublic = :isPublic',
                    ExpressionAttributeNames: {
                        '#isPublic': 'isPublic',
                    },
                    ExpressionAttributeValues: {
                        ':isPublic': event.isPublic,
                    },
                    ReturnValues: 'ALL_NEW',
                })
            );

            if (!updatedEvent.Attributes) {
                throw new AppError('Event Publicity not updated', 400);
            }
            // Use a safer type assertion
            return updatedEvent.Attributes as unknown as Event;
        } catch (error: any) {
            throw new AppError(`Failed to update Event's Publicity: ${error.message}`, 500);
        }
    }

    async updateEvent(event: Event): Promise<Event> {
        try {
            await dynamoDb.send(
                new PutCommand({
                    TableName: TABLE_NAME,
                    Item: {
                        ...event,
                        updatedAt: new Date().toISOString(),
                    },
                })
            );

            return event;
        } catch (error: any) {
            throw new AppError(`Failed to update event: ${error.message}`, 500);
        }
    }

    /**
     * Updates weather data for an event
     * @param eventId The ID of the event
     * @param weatherData The weather data to add
     * @returns The updated event
     */
    async updateEventWeather(eventId: string, weatherData: WeatherData): Promise<Event> {
        try {
            const result = await dynamoDb.send(
                new UpdateCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `EVENT#${eventId}`,
                        SK: 'ENTITY',
                    },
                    UpdateExpression: 'SET weather = :weatherData, updatedAt = :updatedAt',
                    ExpressionAttributeValues: {
                        ':weatherData': weatherData,
                        ':updatedAt': new Date().toISOString(),
                    },
                    ReturnValues: 'ALL_NEW',
                })
            );

            if (!result.Attributes) {
                throw new AppError(`Failed to update event weather data`, 500);
            }
            // Use a safer type assertion
            return result.Attributes as unknown as Event;
        } catch (error: any) {
            throw new AppError(`Failed to update event weather data: ${error.message}`, 500);
        }
    }

    /**
     * Gets all users attending an event, returning the full EventUser items.
     * @param eventId The event's ID
     * @returns Array of EventUser objects representing attendees.
     * @throws AppError if the database operation fails
     */
    async getEventAttendees(eventId: string): Promise<EventUser[]> {
        try {
            const response: QueryCommandOutput = await dynamoDb.send(
                new QueryCommand({
                    TableName: TABLE_NAME,
                    IndexName: 'GSI2PK-GSI2SK-INDEX',
                    KeyConditionExpression:
                        'GSI2PK = :eventId AND begins_with(GSI2SK, :userPrefix)',
                    ExpressionAttributeValues: {
                        ':eventId': `EVENT#${eventId}`,
                        ':userPrefix': 'USER#',
                    },
                    // Fetch all attributes
                    ProjectionExpression: undefined, // Ensure all attributes are fetched
                })
            );

            if (!response.Items || response.Items.length === 0) {
                return [];
            }

            // *** FIX: Use a safer type assertion ***
            return (response.Items as unknown as EventUser[]) || [];
        } catch (error: any) {
            throw new AppError(`Failed to get event attendees: ${error.message}`, 500);
        }
    }


    /**
 * Deletes an event from the database
 * @param eventId The ID of the event to delete
 * @returns True if the deletion was successful
 * @throws AppError if the database operation fails
 */
    async deleteEvent(eventId: string): Promise<boolean> {
        try {
            await dynamoDb.send(
                new DeleteCommand({
                    TableName: TABLE_NAME,
                    Key: {
                        PK: `EVENT#${eventId}`,
                        SK: 'ENTITY',
                    },
                })
            );
            return true;
        } catch (error: any) {
            throw new AppError(`Failed to delete event: ${error.message}`, 500);
        }
    }

    /**
     * Deletes all attendance records for an event
     * @param eventId The ID of the event
     * @returns True if the operation was successful
     * @throws AppError if the database operation fails
     */
    async deleteAllEventAttendance(eventId: string): Promise<boolean> {
        try {
            // First get all users attending the event
            const attendees = await this.getEventAttendees(eventId); // This now returns EventUser[]

            if (attendees.length === 0) {
                return true; // No attendance records to delete
            }

            // Delete each attendance record
            for (const attendee of attendees) {
                const userId = attendee.PK.split('#')[1]; // Extract user ID from PK
                await this.removeAttendingEventRecord(userId, eventId);
            }

            return true;
        } catch (error: any) {
            throw new AppError(`Failed to delete event attendance records: ${error.message}`, 500);
        }
    }
}
