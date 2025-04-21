import { Request, Response, NextFunction, Router } from 'express';
import { EventService } from '../services/eventService';
import { OrgService } from '../services/orgService';
import { EventRequest, Event, EventUser } from '../models/Event';
import { Status } from '../models/Response';
import { checkOrgAdmin, checkOrgMember } from '../middleware/OrgMiddleware'; // Added checkOrgMember
import { UserOrganizationRelationship } from '../models/Organizations';
import { AppError } from '../middleware/errorHandler';
import { WeatherService } from '../services/weatherService';
import { GeocodingService } from '../services/geocodingService';
import { TagService, AttendeeWithDetails } from '../services/tagService'; // Import AttendeeWithDetails

const eventService = new EventService();
const orgService = new OrgService();
const weatherService = new WeatherService();
const geocodingService = new GeocodingService();
const tagService = new TagService();

export const eventRouter = Router({ mergeParams: true });

/*
 * Create an organization's event
 * POST /events
 * Added support for address field to automatically geocode and fetch weather
 */
eventRouter.post('/', checkOrgAdmin, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const orgName: string = req.params.orgId;
        const orgAdmin = res.locals.user as { id: string; email: string; role: string };

        console.log(`Organization name from params: "${orgName}"`);

        const eventRequest: EventRequest = {
            title: req.body.title,
            description: req.body.description,
            date: req.body.date,
            location: req.body.location,
            address: req.body.address, // Include optional address field for geocoding
        };

        const event: Event = await eventService.addEventToOrganization(orgName, eventRequest);
        const userEvent: EventUser = await eventService.addEventUser(orgAdmin.id, event.id);

        // Email notification functionality from HEAD version
        const members: UserOrganizationRelationship[] = await orgService.getOrgMembers(orgName);

        // Prepare response data with separate structures for event and geocoding info
        const responseData: Array<Event | EventUser | Record<string, any>> = [userEvent, event];

        // If address was provided and successfully geocoded, add info to response
        if (eventRequest.address && event.location) {
            responseData.push({
                geocoding: {
                    providedAddress: eventRequest.address,
                    resolvedCoordinates: {
                        latitude: event.location.latitude,
                        longitude: event.location.longitude,
                        formattedAddress: event.location.name,
                    },
                },
            });
        }

        // Prepare success response with combined data
        const status: Status = {
            statusCode: 201,
            status: 'success',
            data: responseData,
        };

        // Add email notification if members exist
        if (members && members.length > 0) {
            const membersEmail: string[] = members.map(member => member.email);

            // Creates the email data.
            const to: string = membersEmail.toString();
            const subject: string = `An update from PhotoComp!`;
            const message: string = `Don't miss updates on this event: ${req.body.title} - ${req.body.date}.
                    Know more by checking out the website!`;
            const header: string = `A new event in ${orgName} has been created!`;

            res.locals.user.emailInfo = { to, message, header, subject };
        }

        next(status);
    } catch (error) {
        next(error);
    }
});

/*
 * Get the organizations events
 * GET /events
 * Protected by checkOrgMember middleware
 */
eventRouter.get('/', checkOrgMember, async (req: Request, res: Response, next: NextFunction) => {
    const orgID: string = req.params.orgId;
    try {
        const events: Event[] = await eventService.getAllOrganizationEvents(orgID);
        return res.status(200).json({
            status: 'success',
            data: {
                events: events,
            },
        });
    } catch (error) {
        next(error);
    }
});

/*
 * Get details of a specific event *AND* its attendees with details
 * GET /events/:eid
 * Protected by checkOrgMember middleware
 */
eventRouter.get(
    '/:eid',
    checkOrgMember, // Ensure only org members can access event details
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const eventId: string = req.params.eid;
            const orgId: string = req.params.orgId; // Get orgId from route params

            // Fetch event details
            const eventDetails = await eventService.findEventById(eventId);
            if (!eventDetails) {
                throw new AppError('Event not found', 404);
            }

            // Fetch attendees with their details using the updated TagService method
            const attendees: AttendeeWithDetails[] = await tagService.getEventAttendeesWithDetails(eventId);

            // Return both event details and attendee details
            return res.status(200).json({
                status: 'success',
                data: {
                    event: eventDetails,
                    attendees: attendees, // Return the enriched attendee list
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

/*
 * Update event's publicity
 * PATCH /events/:eid
 */
eventRouter.patch(
    '/:eid',
    checkOrgAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
        const eventId: string = req.params.eid;
        const user = res.locals.user.info;

        try {
            const event = await eventService.findEventById(eventId);
            if (!event) {
                throw new AppError('Event not found', 404);
            }

            await eventService.findEventUserbyUser(eventId, user.id);

            const updatedEvent = await eventService.updateEventPublicity(event as Event);

            return res.status(200).json({
                status: "Updating Event's publicity success!",
                data: {
                    updatedEvent,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

/*
 * Create an Attendance record for an event
 * POST /events/:eid
 * Protected by checkOrgMember middleware
 */
eventRouter.post('/:eid', checkOrgMember, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const eventId: string = req.params.eid;
        const member = res.locals.user as { id: string; email: string; role: string };

        const userEvent: EventUser = await eventService.addEventUser(member.id, eventId);

        return res.status(201).json({
            status: 'success',
            data: {
                userEvent,
            },
        });
    } catch (error) {
        next(error);
    }
});

/*
 * Remove the Attendance record for an event
 * DELETE /events/:eid
 * Protected by checkOrgMember middleware
 */
eventRouter.delete('/:eid', checkOrgMember, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const eventId: string = req.params.eid;
        const member = res.locals.user as { id: string; email: string; role: string };

        await eventService.removeEventUser(member.id, eventId);

        return res.status(200).json({ // Changed status to 200 for successful DELETE
            status: 'success',
            message: 'Attendance removed successfully',
        });
    } catch (error) {
        next(error);
    }
});

/*
 * Refresh weather data for an event
 * POST /events/:eid/weather/refresh
 */
eventRouter.post(
    '/:eid/weather/refresh',
    checkOrgAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const eventId: string = req.params.eid;

            const updatedEvent = await eventService.refreshEventWeather(eventId);

            return res.status(200).json({
                status: 'success',
                data: {
                    event: updatedEvent,
                },
            });
        } catch (error) {
            next(error);
        }
    }
);

/*
 * Update event location and fetch weather data
 * PATCH /events/:eid/location
 */
eventRouter.patch(
    '/:eid/location',
    checkOrgAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const eventId: string = req.params.eid;
            const { latitude, longitude, name } = req.body;

            if (typeof latitude !== 'number' || typeof longitude !== 'number') {
                throw new AppError('Valid latitude and longitude are required', 400);
            }

            // First get the existing event
            const event = await eventService.findEventById(eventId);

            if (!event) {
                throw new AppError('Event not found', 404);
            }

            // Update event with location data
            event.location = {
                latitude,
                longitude,
                name: name || undefined,
            };

            // Update event in database
            const updatedEvent = await eventService.updateEvent(event);

            // Fetch and add weather data
            try {
                const weatherData = await weatherService.getWeatherForLocation(
                    latitude,
                    longitude,
                    event.date
                );

                const eventWithWeather = await eventService.updateEventWeather(
                    eventId,
                    weatherData
                );

                return res.status(200).json({
                    status: 'success',
                    data: {
                        event: eventWithWeather,
                    },
                });
            } catch (weatherError) {
                // Return updated event even if weather fetch fails
                return res.status(200).json({
                    status: 'success',
                    message: 'Location updated but weather data could not be fetched',
                    data: {
                        event: updatedEvent,
                    },
                });
            }
        } catch (error) {
            next(error);
        }
    }
);

/*
 * Update event location using an address and fetch weather data
 * PATCH /events/:eid/location/address
 */
eventRouter.patch(
    '/:eid/location/address',
    checkOrgAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const eventId: string = req.params.eid;
            const { address } = req.body;

            if (!address || typeof address !== 'string') {
                throw new AppError('Valid address is required', 400);
            }

            // First get the existing event
            const event = await eventService.findEventById(eventId);

            if (!event) {
                throw new AppError('Event not found', 404);
            }

            // Geocode the address to get coordinates
            const geocodingResult = await geocodingService.geocodeAddress(address);

            // Update event with location data
            event.location = {
                latitude: geocodingResult.latitude,
                longitude: geocodingResult.longitude,
                name: geocodingResult.displayName,
            };

            // Update event in database
            const updatedEvent = await eventService.updateEvent(event);

            // Fetch and add weather data
            try {
                const weatherData = await weatherService.getWeatherForLocation(
                    geocodingResult.latitude,
                    geocodingResult.longitude,
                    event.date
                );

                const eventWithWeather = await eventService.updateEventWeather(
                    eventId,
                    weatherData
                );

                return res.status(200).json({
                    status: 'success',
                    data: {
                        event: eventWithWeather,
                        geocoding: {
                            latitude: geocodingResult.latitude,
                            longitude: geocodingResult.longitude,
                            formattedAddress: geocodingResult.displayName,
                        },
                    },
                });
            } catch (weatherError) {
                // Return updated event even if weather fetch fails
                return res.status(200).json({
                    status: 'success',
                    message: 'Location updated but weather data could not be fetched',
                    data: {
                        event: updatedEvent,
                        geocoding: {
                            latitude: geocodingResult.latitude,
                            longitude: geocodingResult.longitude,
                            formattedAddress: geocodingResult.displayName,
                        },
                    },
                });
            }
        } catch (error) {
            next(error);
        }
    }
);

/*
 * Get all a User's Events
 * GET /users/:userId/events
 */
export const getUserEvents = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = req.params.userId;
        const requestingUserId = res.locals.user.id;

        if (userId !== requestingUserId) {
            throw new AppError("You cannot get this user's events", 403);
        }

        const events = await eventService.getAllUserEvents(userId);
        const eventsWithDetails = await Promise.all(
            events.map(async request => {
                const eventDetails = await eventService.findEventById(request.id);
                return {
                    ...request,
                    event: eventDetails
                        ? {
                            title: eventDetails.title,
                            description: eventDetails.description,
                            date: eventDetails.date,
                            weather: eventDetails.weather,
                            location: eventDetails.location,
                        }
                        : null,
                };
            })
        );

        return res.status(200).json({
            status: 'success',
            events: eventsWithDetails,
        });
    } catch (error) {
        next(error);
    }
};

/*
 * Delete an event and all associated resources
 * DELETE /events/:eid/admin
 */
eventRouter.delete(
    '/:eid/admin',
    checkOrgAdmin,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const orgName: string = req.params.orgId;
            const eventId: string = req.params.eid;
            const admin = res.locals.user as { id: string; email: string; role: string };

            // Delete the event and all associated resources (attendance, photos)
            await eventService.deleteEvent(orgName, eventId, admin.id);

            return res.status(200).json({
                status: 'success',
                message: 'Event deleted successfully'
            });
        } catch (error) {
            next(error);
        }
    }
);
