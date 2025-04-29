import { AppError } from '../middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../util/logger';
import { S3Repository } from '../repositories/s3Repository';
import { PhotoSizes } from '../models/Photo';

export class S3Service {
    private s3Repository: S3Repository;

    constructor(s3Repository: S3Repository = new S3Repository()) {
        this.s3Repository = s3Repository;
    }

    /**
     * Uploads a logo from a URL to S3
     * @param url The URL of the logo to upload
     * @param organizationName The name of the organization (used for creating the S3 key)
     * @returns The S3 key where the logo was uploaded
     */
    async uploadLogoFromUrl(url: string, organizationName: string): Promise<string> {
        try {
            // Validate URL
            const validUrl = new URL(url);

            // Fetch the image data from the URL
            const response = await fetch(url);
            if (!response.ok) {
                throw new AppError(`Failed to fetch image from URL: ${response.statusText}`, 400);
            }

            // Get the image data as an array buffer
            const imageData = await response.arrayBuffer();

            // Generate a unique key for the S3 object
            // Using prefix pattern: logos/<organizationName>/<uniqueId>.<extension>
            const urlParts = validUrl.pathname.split('.');
            const fileExtension = urlParts.length > 1 ? urlParts[urlParts.length - 1] : 'jpg';
            const sanitizedOrgName = organizationName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
            const s3Key = `logos/${sanitizedOrgName}/${uuidv4()}.${fileExtension}`;

            // Get content type or default to image/jpeg
            const contentType = response.headers.get('content-type') || 'image/jpeg';

            // Upload to S3 using the repository
            return await this.s3Repository.uploadFile(Buffer.from(imageData), s3Key, contentType);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            logger.error('Error uploading logo to S3:', error);
            throw new AppError(`Failed to upload logo to S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Uploads a file buffer directly to S3
     * @param fileBuffer The buffer containing file data
     * @param key The S3 key where the file will be stored
     * @param contentType The content type of the file
     * @returns The S3 key where the file was uploaded
     */
    async uploadFileBuffer(fileBuffer: Buffer, key: string, contentType: string): Promise<string> {
        try {
            return await this.s3Repository.uploadFile(fileBuffer, key, contentType);
        } catch (error) {
            logger.error('Error uploading file to S3:', error);
            throw new AppError(`Failed to upload file to S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Uploads multiple resized images to S3
     * @param buffers Object containing buffers for different sizes
     * @param s3Keys Object containing S3 keys for different sizes
     * @param contentType The content type of the files
     * @returns Object containing the S3 keys for all uploaded files
     */
    async uploadResizedImages(
        buffers: Record<string, Buffer>,
        s3Keys: Record<string, string>,
        contentType: string
    ): Promise<Record<string, string>> {
        try {
            // Prepare array of file objects for upload
            const files = Object.entries(buffers).map(([size, buffer]) => ({
                buffer,
                key: s3Keys[size],
                contentType,
            }));

            // Upload all files to S3
            await this.s3Repository.uploadMultipleFiles(files);

            // Return the S3 keys
            return s3Keys;
        } catch (error) {
            logger.error('Error uploading resized images to S3:', error);
            throw new AppError(`Failed to upload resized images to S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Gets a pre-signed URL for accessing a file in S3
     * @param s3Key The S3 key of the file
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns The pre-signed URL
     */
    async getLogoPreSignedUrl(s3Key: string, expiresIn: number = 10): Promise<string> {
        return this.s3Repository.getPreSignedUrl(s3Key, expiresIn);
    }

    /**
     * Gets pre-signed URLs for multiple files in S3
     * @param s3Keys Object mapping size names to S3 keys
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns Object mapping size names to pre-signed URLs
     */
    async getMultiplePreSignedUrls(
        s3Keys: Record<string, string>,
        expiresIn: number = 10
    ): Promise<PhotoSizes> {
        try {
            // Get all key values from the s3Keys object
            const keyArray = Object.values(s3Keys);

            // Get all pre-signed URLs
            const urlMap = await this.s3Repository.getMultiplePreSignedUrls(keyArray, expiresIn);

            // Rebuild the object with the size names and URLs
            const result: PhotoSizes = { original: '' };

            for (const [size, key] of Object.entries(s3Keys)) {
                if (urlMap[key]) {
                    result[size as keyof PhotoSizes] = urlMap[key];
                }
            }

            return result;
        } catch (error) {
            logger.error('Error getting multiple pre-signed URLs:', error);
            throw new AppError(`Failed to get multiple pre-signed URLs: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Gets a pre-signed URL for downloading a file from S3
     * @param s3Key The S3 key of the file
     * @param filename The suggested filename for the download
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns The pre-signed URL with content-disposition header set
     */
    async getDownloadUrl(
        s3Key: string,
        filename: string,
        expiresIn: number = 10
    ): Promise<string> {
        return this.s3Repository.getDownloadPreSignedUrl(s3Key, filename, expiresIn);
    }

    /**
     * Deletes a file from S3
     * @param s3Key The S3 key of the file to delete
     */
    async deleteFile(s3Key: string): Promise<void> {
        return this.s3Repository.deleteFile(s3Key);
    }

    /**
     * Deletes multiple files from S3
     * @param s3Keys Array of S3 keys to delete
     */
    async deleteMultipleFiles(s3Keys: string[]): Promise<void> {
        return this.s3Repository.deleteMultipleFiles(s3Keys);
    }
    /**
 * Uploads a logo file directly to S3
 * @param fileBuffer The buffer containing logo file data
 * @param organizationName The name of the organization (used for creating the S3 key)
 * @param mimeType The mimetype of the file
 * @returns The S3 key where the logo was uploaded
 */
    async uploadLogoFromBuffer(
        fileBuffer: Buffer,
        organizationName: string,
        mimeType: string
    ): Promise<string> {
        try {
            // Extract file extension from mimetype
            const fileExtension = mimeType.split('/')[1] || 'jpg';

            // Sanitize organization name for use in S3 key
            const sanitizedOrgName = organizationName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();

            // Generate a unique key for the S3 object
            const s3Key = `logos/${sanitizedOrgName}/${uuidv4()}.${fileExtension}`;

            // Upload to S3 using the repository
            return await this.s3Repository.uploadFile(fileBuffer, s3Key, mimeType);
        } catch (error) {
            if (error instanceof AppError) {
                throw error;
            }

            logger.error('Error uploading logo to S3:', error);
            throw new AppError(`Failed to upload logo to S3: ${(error as Error).message}`, 500);
        }
    }


    /**
     * Utility method to extract an S3 key from a pre-signed URL
     * @param url The pre-signed URL to extract the key from
     * @returns The extracted S3 key or null if extraction fails
     */
    async extractS3KeyFromUrl(url: string): Promise<string | null> {
        try {
            if (!url || url.trim() === '') {
                return null;
            }

            // Parse the URL
            const urlParts = new URL(url);

            // Extract just the path without query parameters
            const path = urlParts.pathname;

            // Remove leading slash
            const s3Key = path.startsWith('/') ? path.substring(1) : path;

            if (!s3Key || s3Key.trim() === '') {
                return null;
            }

            return s3Key;
        } catch (error) {
            logger.error('Error extracting S3 key from URL:', error);
            return null;
        }
    }

    /**
     * Refresh a pre-signed URL - handles various input cases
     * @param url The existing URL to refresh
     * @param s3Key The S3 key if known
     * @returns A fresh pre-signed URL or null if refresh fails
     */
    async refreshPresignedUrl(url?: string, s3Key?: string): Promise<string | null> {
        try {
            // Case 1: S3 key is provided - use it directly
            if (s3Key) {
                return await this.getLogoPreSignedUrl(s3Key);
            }

            // Case 2: URL is provided but no S3 key - extract key from URL
            if (url) {
                const extractedKey = await this.extractS3KeyFromUrl(url);
                if (extractedKey) {
                    return await this.getLogoPreSignedUrl(extractedKey);
                }
            }

            // Failed to refresh URL
            return null;
        } catch (error) {
            logger.error('Error refreshing pre-signed URL:', error);
            return null;
        }
    }
}