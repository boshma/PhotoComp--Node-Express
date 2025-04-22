import sharp from 'sharp';
import { logger } from '../util/logger';
import { PhotoSizes } from '../models/Photo';

interface ImageInfo {
    format: string;
    width: number;
    height: number;
    size: number;
}

interface ResizeOptions {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
    quality?: number;
}

/**
 * Service for processing and resizing images
 * Uses the Sharp library to manipulate images efficiently
 * Implements smart resizing to avoid quality loss from upscaling
 */
export class ImageService {
    // Define standard sizes for different use cases
    static readonly SIZES = {
        THUMBNAIL: { width: 200, quality: 80 },
        MEDIUM: { width: 400, quality: 85 },
        LARGE: { width: 1600, quality: 90 },
    };

    /**
     * Get image information from a buffer
     * @param buffer The image buffer
     * @returns Promise with image metadata
     */
    async getImageInfo(buffer: Buffer): Promise<ImageInfo> {
        try {
            const metadata = await sharp(buffer).metadata();
            
            return {
                format: metadata.format || 'unknown',
                width: metadata.width || 0,
                height: metadata.height || 0,
                size: buffer.length,
            };
        } catch (error) {
            logger.error('Error getting image info:', error);
            throw new Error(`Failed to get image info: ${(error as Error).message}`);
        }
    }

    /**
     * Resize an image to different dimensions
     * Only downscales (never upscales) to prevent quality loss
     * @param buffer The original image buffer
     * @param options Resize options
     * @param originalWidth Original image width to prevent upscaling
     * @returns Promise with the resized image buffer
     */
    async resizeImage(
        buffer: Buffer, 
        options: ResizeOptions, 
        originalWidth: number
    ): Promise<Buffer> {
        try {
            const { width, height, fit = 'cover', quality = 85 } = options;
            
            // Get original image metadata
            const metadata = await sharp(buffer).metadata();
            const originalFormat = metadata.format;
            
            // Calculate target width - never upscale
            // If requested width is larger than original, use original width instead
            const targetWidth = width && width < originalWidth ? width : originalWidth;
            
            // Prepare the resize operation
            let resizer = sharp(buffer).resize({
                width: targetWidth,
                height, // Height will adapt based on aspect ratio if not specified
                fit
            });
            
            // Apply appropriate compression based on format
            if (originalFormat === 'jpeg' || originalFormat === 'jpg') {
                resizer = resizer.jpeg({ quality });
            } else if (originalFormat === 'png') {
                // For PNG files, we'll convert to JPEG if no transparency is detected
                // This can dramatically reduce file size for web display
                const { hasAlpha } = metadata;
                
                if (hasAlpha) {
                    // Keep as PNG with quality setting if it has transparency
                    resizer = resizer.png({ quality: Math.min(quality, 100) });
                } else {
                    // Convert to JPEG if no transparency - much smaller file size
                    resizer = resizer.jpeg({ quality });
                }
            } else if (originalFormat === 'webp') {
                resizer = resizer.webp({ quality });
            } else {
                // Default to jpeg for other formats
                resizer = resizer.jpeg({ quality });
            }
            
            return await resizer.toBuffer();
        } catch (error) {
            logger.error('Error resizing image:', error);
            throw new Error(`Failed to resize image: ${(error as Error).message}`);
        }
    }

    /**
     * Generate multiple sizes of an image, but only sizes smaller than the original
     * This prevents quality loss from upscaling
     * @param buffer The original image buffer
     * @param baseKey The base S3 key without extension
     * @param fileExtension The file extension
     * @returns Object with all processed image buffers and their S3 keys
     */
    async generateImageSizes(
        buffer: Buffer, 
        baseKey: string,
        fileExtension: string
    ): Promise<{
        buffers: Record<string, Buffer>;
        s3Keys: Record<string, string>;
        dimensions: Record<string, { width: number; height: number }>;
    }> {
        try {
            // Get original image info
            const imageInfo = await this.getImageInfo(buffer);
            const originalWidth = imageInfo.width;
            
            // Determine final file extension based on format
            let finalExtension = fileExtension;
            // If the original image format can be detected, use that for more accurate extension
            if (imageInfo.format && imageInfo.format !== 'unknown') {
                finalExtension = imageInfo.format;
            }
            
            // Initialize output containers
            const buffers: Record<string, Buffer> = {};
            const s3Keys: Record<string, string> = {};
            const dimensions: Record<string, { width: number; height: number }> = {};
            
            // Always include the original image
            buffers['original'] = buffer;
            s3Keys['original'] = `${baseKey}.${finalExtension}`;
            dimensions['original'] = { width: imageInfo.width, height: imageInfo.height };
            
            logger.info(`Original image dimensions: ${imageInfo.width}x${imageInfo.height}, ${imageInfo.size} bytes`);
            
            // Only create thumbnail if original is larger than thumbnail size
            if (originalWidth > ImageService.SIZES.THUMBNAIL.width) {
                const thumbnailBuffer = await this.resizeImage(
                    buffer, 
                    ImageService.SIZES.THUMBNAIL, 
                    originalWidth
                );
                const thumbnailInfo = await this.getImageInfo(thumbnailBuffer);
                
                buffers['thumbnail'] = thumbnailBuffer;
                s3Keys['thumbnail'] = `${baseKey}_thumbnail.${finalExtension}`;
                dimensions['thumbnail'] = { width: thumbnailInfo.width, height: thumbnailInfo.height };
                
                logger.info(`Thumbnail dimensions: ${thumbnailInfo.width}x${thumbnailInfo.height}, ${thumbnailInfo.size} bytes`);
            } else {
                logger.info(`Original image (${originalWidth}px) smaller than thumbnail size (${ImageService.SIZES.THUMBNAIL.width}px) - skipping thumbnail`);
            }
            
            // Only create medium size if original is larger than medium size
            if (originalWidth > ImageService.SIZES.MEDIUM.width) {
                const mediumBuffer = await this.resizeImage(
                    buffer, 
                    ImageService.SIZES.MEDIUM, 
                    originalWidth
                );
                const mediumInfo = await this.getImageInfo(mediumBuffer);
                
                buffers['medium'] = mediumBuffer;
                s3Keys['medium'] = `${baseKey}_medium.${finalExtension}`;
                dimensions['medium'] = { width: mediumInfo.width, height: mediumInfo.height };
                
                logger.info(`Medium dimensions: ${mediumInfo.width}x${mediumInfo.height}, ${mediumInfo.size} bytes`);
            } else {
                logger.info(`Original image (${originalWidth}px) smaller than medium size (${ImageService.SIZES.MEDIUM.width}px) - skipping medium`);
            }
            
            // Only create large size if original is larger than large size
            if (originalWidth > ImageService.SIZES.LARGE.width) {
                const largeBuffer = await this.resizeImage(
                    buffer, 
                    ImageService.SIZES.LARGE, 
                    originalWidth
                );
                const largeInfo = await this.getImageInfo(largeBuffer);
                
                buffers['large'] = largeBuffer;
                s3Keys['large'] = `${baseKey}_large.${finalExtension}`;
                dimensions['large'] = { width: largeInfo.width, height: largeInfo.height };
                
                logger.info(`Large dimensions: ${largeInfo.width}x${largeInfo.height}, ${largeInfo.size} bytes`);
            } else {
                logger.info(`Original image (${originalWidth}px) smaller than large size (${ImageService.SIZES.LARGE.width}px) - skipping large`);
            }
            
            return {
                buffers,
                s3Keys,
                dimensions
            };
        } catch (error) {
            logger.error('Error generating image sizes:', error);
            throw new Error(`Failed to generate image sizes: ${(error as Error).message}`);
        }
    }
}