import { s3Client, getSignedUrl, S3_BUCKET_NAME } from '../config/s3';
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../util/logger';

export class S3Repository {
    /**
     * Uploads a file to S3 from buffer data
     * @param fileBuffer The buffer containing file data
     * @param key The S3 key where the file will be stored
     * @param contentType The content type of the file
     * @returns The S3 key where the file was uploaded
     */
    async uploadFile(fileBuffer: Buffer, key: string, contentType: string): Promise<string> {
        try {
            const command = new PutObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
                Body: fileBuffer,
                ContentType: contentType,
            });

            await s3Client.send(command);
            logger.info(`Uploaded file to S3: ${key}`);

            return key;
        } catch (error) {
            logger.error('Error uploading file to S3:', error);
            throw new AppError(`Failed to upload file to S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Uploads multiple files to S3
     * @param files Object containing buffers with their corresponding keys and content types
     * @returns Object with the uploaded keys
     */
    async uploadMultipleFiles(
        files: Array<{
            buffer: Buffer;
            key: string;
            contentType: string;
        }>
    ): Promise<string[]> {
        try {
            const uploadPromises = files.map(file =>
                this.uploadFile(file.buffer, file.key, file.contentType)
            );
            
            const results = await Promise.all(uploadPromises);
            logger.info(`Uploaded ${results.length} files to S3`);
            
            return results;
        } catch (error) {
            logger.error('Error uploading multiple files to S3:', error);
            throw new AppError(`Failed to upload multiple files to S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Generates a pre-signed URL for accessing an S3 object
     * @param key The S3 key of the object
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns The pre-signed URL
     */
    async getPreSignedUrl(key: string, expiresIn: number = 10): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
            return presignedUrl;
        } catch (error) {
            logger.error('Error generating pre-signed URL:', error);
            throw new AppError(
                `Failed to generate pre-signed URL: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
     * Generates multiple pre-signed URLs for accessing S3 objects
     * @param keys Array of S3 keys
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns Object mapping keys to their pre-signed URLs
     */
    async getMultiplePreSignedUrls(
        keys: string[],
        expiresIn: number = 10
    ): Promise<Record<string, string>> {
        try {
            const urlPromises = keys.map(async key => ({
                key,
                url: await this.getPreSignedUrl(key, expiresIn),
            }));
            
            const results = await Promise.all(urlPromises);
            
            // Convert array of results to object mapping
            const urlMap: Record<string, string> = {};
            for (const result of results) {
                urlMap[result.key] = result.url;
            }
            
            return urlMap;
        } catch (error) {
            logger.error('Error generating multiple pre-signed URLs:', error);
            throw new AppError(
                `Failed to generate multiple pre-signed URLs: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
     * Generates a pre-signed URL for downloading an S3 object with a specific filename
     * @param key The S3 key of the object
     * @param filename The suggested filename for the download
     * @param expiresIn The expiration time in seconds (default: 10 seconds)
     * @returns The pre-signed URL with content-disposition header set
     */
    async getDownloadPreSignedUrl(
        key: string,
        filename: string,
        expiresIn: number = 10
    ): Promise<string> {
        try {
            const command = new GetObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
                ResponseContentDisposition: `attachment; filename="${encodeURIComponent(filename)}"`,
            });

            const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
            return presignedUrl;
        } catch (error) {
            logger.error('Error generating download pre-signed URL:', error);
            throw new AppError(
                `Failed to generate download pre-signed URL: ${(error as Error).message}`,
                500
            );
        }
    }

    /**
     * Deletes a file from S3
     * @param key The S3 key of the object to delete
     */
    async deleteFile(key: string): Promise<void> {
        try {
            const command = new DeleteObjectCommand({
                Bucket: S3_BUCKET_NAME,
                Key: key,
            });

            await s3Client.send(command);
            logger.info(`Deleted file from S3: ${key}`);
        } catch (error) {
            logger.error('Error deleting file from S3:', error);
            throw new AppError(`Failed to delete file from S3: ${(error as Error).message}`, 500);
        }
    }

    /**
     * Deletes multiple files from S3
     * @param keys Array of S3 keys to delete
     */
    async deleteMultipleFiles(keys: string[]): Promise<void> {
        try {
            const deletePromises = keys.map(key => this.deleteFile(key));
            await Promise.all(deletePromises);
            logger.info(`Deleted ${keys.length} files from S3`);
        } catch (error) {
            logger.error('Error deleting multiple files from S3:', error);
            throw new AppError(
                `Failed to delete multiple files from S3: ${(error as Error).message}`,
                500
            );
        }
    }
}