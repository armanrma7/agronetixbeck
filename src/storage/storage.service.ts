import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private supabase: SupabaseClient;
  private readonly bucketName: string;
  private readonly urlExpirationSeconds: number;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    // Use service role key to bypass RLS policies
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') 
      || this.configService.get<string>('SUPABASE_KEY'); // Fallback for backward compatibility
    this.bucketName = this.configService.get<string>('SUPABASE_STORAGE_BUCKET') || 'agronetxbeck';
    
    // URL expiration time in seconds (default: 1 hour = 3600 seconds)
    // Can be configured via SUPABASE_URL_EXPIRATION_SECONDS env variable
    this.urlExpirationSeconds = this.configService.get<number>('SUPABASE_URL_EXPIRATION_SECONDS') 
      || 60 * 60; // 1 hour default

    if (!supabaseUrl || !supabaseServiceKey) {
      this.logger.warn('Supabase Storage not configured. Image uploads will fail.');
      this.logger.warn(`SUPABASE_URL: ${supabaseUrl ? 'SET' : 'MISSING'}`);
      this.logger.warn(`SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceKey ? 'SET' : 'MISSING'}`);
      return;
    }

    // Create client with service role key (bypasses RLS)
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    
    this.logger.log(`Supabase Storage initialized for bucket: ${this.bucketName}`);
    this.logger.log(`Signed URL expiration: ${this.urlExpirationSeconds} seconds (${(this.urlExpirationSeconds / 60).toFixed(1)} minutes)`);
  }

  /**
   * Upload image file to Supabase Storage
   */
  async uploadImage(
    file: any, // Express.Multer.File
    folder: string = 'announcements'
  ): Promise<string> {
    this.logger.log(`Starting image upload: ${file.originalname}, size: ${file.size} bytes (${(file.size / 1024 / 1024).toFixed(2)}MB), type: ${file.mimetype}`);

    if (!this.supabase) {
      this.logger.error('Storage service not configured - Supabase client is missing');
      throw new BadRequestException('Storage service not configured');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      this.logger.warn(`Invalid file type: ${file.mimetype}. Allowed: ${allowedMimeTypes.join(', ')}`);
      throw new BadRequestException(
        `Invalid file type: ${file.mimetype}. Allowed types: ${allowedMimeTypes.join(', ')}`
      );
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    const fileSizeMB = file.size / 1024 / 1024;
    this.logger.log(`File size check: ${fileSizeMB.toFixed(2)}MB / ${(maxSize / 1024 / 1024).toFixed(2)}MB limit`);
    
    if (file.size > maxSize) {
      this.logger.warn(`File size exceeds limit: ${fileSizeMB.toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(2)}MB`);
      throw new BadRequestException(
        `File size (${fileSizeMB.toFixed(2)}MB) exceeds 5MB limit. Your file is ${fileSizeMB.toFixed(2)}MB, maximum allowed is 5MB.`
      );
    }

    // Generate unique filename with announcement-specific folder
    // Format: announcements/{announcementId}/{timestamp}-{random}.{ext}
    // For now, use timestamp-based folder until announcement ID is available
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const folderId = Math.random().toString(36).substring(2, 10); // Short folder ID
    const fileName = `${folder}/${folderId}/${timestamp}-${randomString}.${extension}`;

    try {
      this.logger.log(`Uploading to Supabase Storage bucket: ${this.bucketName}, file: ${fileName}`);
      
      // Upload to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (error) {
        this.logger.error(`Supabase upload error: ${error.message}`, error);
        this.logger.error(`Error details: ${JSON.stringify(error)}`);
        
        // Provide helpful error message for RLS issues
        if (error.message?.includes('row-level security') || error.message?.includes('RLS')) {
          throw new BadRequestException(
            `Storage upload failed due to RLS policy. Please ensure:\n` +
            `1. You're using SUPABASE_SERVICE_ROLE_KEY (not anon key)\n` +
            `2. Run the SQL script: database/fix_storage_rls_policies.sql\n` +
            `3. Or disable RLS on the storage bucket in Supabase dashboard`
          );
        }
        
        throw new BadRequestException(`Failed to upload image: ${error.message}`);
      }

      this.logger.log(`File uploaded successfully to storage: ${fileName}`);
      
      // Return the file path (key) instead of signed URL
      // Signed URLs will be generated on-the-fly when returning data
      return fileName;
    } catch (error) {
      this.logger.error(`Error uploading image ${file.originalname}: ${error.message}`, error.stack);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to upload image: ${error.message}`);
    }
  }

  /**
   * Upload multiple images
   */
  async uploadImages(
    files: any[], // Express.Multer.File[]
    folder: string = 'announcements'
  ): Promise<string[]> {
    if (!files || files.length === 0) {
      this.logger.log('No files to upload');
      return [];
    }

    this.logger.log(`Uploading ${files.length} image(s)`);
    const uploadPromises = files.map((file, index) => {
      this.logger.log(`Processing image ${index + 1}/${files.length}: ${file.originalname}`);
      return this.uploadImage(file, folder);
    });
    
    const results = await Promise.all(uploadPromises);
    this.logger.log(`Successfully uploaded ${results.length} image(s)`);
    return results;
  }

  /**
   * Delete image from Supabase Storage
   * Accepts either a file path (key) or a URL
   */
  async deleteImage(filePathOrUrl: string): Promise<void> {
    if (!this.supabase) {
      this.logger.warn('Storage service not configured. Cannot delete image.');
      return;
    }

    try {
      // Extract file path from URL or use as-is if it's already a path
      let fileName: string = filePathOrUrl;
      
      // Check if it's a URL
      if (filePathOrUrl.includes('http://') || filePathOrUrl.includes('https://')) {
        if (filePathOrUrl.includes('/object/sign/')) {
          // Signed URL format: https://project.supabase.co/storage/v1/object/sign/bucket/path?token=...
          // Extract path after /object/sign/bucket/
          const match = filePathOrUrl.match(/\/object\/sign\/[^/]+\/(.+?)(\?|$)/);
          if (match && match[1]) {
            fileName = match[1];
          } else {
            // Fallback: try to extract from URL path
            const urlParts = filePathOrUrl.split('/');
            const signIndex = urlParts.findIndex(part => part === 'sign');
            if (signIndex !== -1 && signIndex + 2 < urlParts.length) {
              fileName = urlParts.slice(signIndex + 2).join('/').split('?')[0];
            } else {
              fileName = urlParts.slice(-2).join('/').split('?')[0];
            }
          }
        } else {
          // Public URL or direct path
          const urlParts = filePathOrUrl.split('/');
          fileName = urlParts.slice(-2).join('/').split('?')[0];
        }
      }

      this.logger.log(`Deleting image: ${fileName}`);

      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([fileName]);

      if (error) {
        this.logger.error(`Failed to delete image: ${error.message}`);
      } else {
        this.logger.log(`Image deleted successfully: ${fileName}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting image: ${error.message}`);
    }
  }

  /**
   * Delete multiple images
   */
  async deleteImages(fileUrls: string[]): Promise<void> {
    if (!fileUrls || fileUrls.length === 0) {
      return;
    }

    const deletePromises = fileUrls.map((url) => this.deleteImage(url));
    await Promise.all(deletePromises);
  }

  /**
   * Generate signed URL from file path (key)
   * Use this when returning data to generate fresh signed URLs
   */
  async getSignedUrl(filePath: string): Promise<string | null> {
    if (!this.supabase) {
      this.logger.warn('Storage service not configured. Cannot generate signed URL.');
      return null;
    }

    try {
      // If it's already a URL, extract the path
      let fileName: string = filePath;
      
      // Check if it's already a signed URL or public URL
      if (filePath.includes('http://') || filePath.includes('https://')) {
        if (filePath.includes('/object/sign/')) {
          // Signed URL format: extract path
          const match = filePath.match(/\/object\/sign\/[^/]+\/(.+?)(\?|$)/);
          if (match && match[1]) {
            fileName = match[1];
          } else {
            // Fallback extraction
            const urlParts = filePath.split('/');
            const signIndex = urlParts.findIndex(part => part === 'sign');
            if (signIndex !== -1 && signIndex + 2 < urlParts.length) {
              fileName = urlParts.slice(signIndex + 2).join('/').split('?')[0];
            }
          }
        } else {
          // Public URL: extract path
          const urlParts = filePath.split('/');
          fileName = urlParts.slice(-2).join('/').split('?')[0];
        }
      }

      const { data: signedUrlData, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(fileName, this.urlExpirationSeconds);

      if (error) {
        this.logger.error(`Failed to generate signed URL for ${fileName}: ${error.message}`);
        return null;
      }

      return signedUrlData?.signedUrl || null;
    } catch (error) {
      this.logger.error(`Error generating signed URL: ${error.message}`);
      return null;
    }
  }

  /**
   * Generate signed URLs from an array of file paths
   */
  async getSignedUrls(filePaths: string[]): Promise<string[]> {
    if (!filePaths || filePaths.length === 0) {
      return [];
    }

    const urlPromises = filePaths.map((path) => this.getSignedUrl(path));
    const urls = await Promise.all(urlPromises);
    
    // Filter out null values
    return urls.filter((url): url is string => url !== null);
  }
}

