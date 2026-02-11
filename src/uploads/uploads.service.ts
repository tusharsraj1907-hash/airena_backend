import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private s3Client: S3Client | null = null;
  private bucketName: string | null = null;
  private endpoint: string | null = null;
  private _isCloudStorageConfigured = false;
  private storageType: 'b2' | 'local' | null = null;
  private localStoragePath: string;

  constructor(private configService: ConfigService) {
    // Set up local storage path
    this.localStoragePath = path.join(process.cwd(), 'uploads');
    this.initializeStorage();
  }

  private initializeStorage() {
    // Check for Backblaze B2 configuration (S3-compatible)
    const b2KeyId = this.configService.get<string>('B2_APPLICATION_KEY_ID');
    const b2Key = this.configService.get<string>('B2_APPLICATION_KEY');
    const b2Bucket = this.configService.get<string>('B2_BUCKET_NAME');
    const b2Endpoint = this.configService.get<string>('B2_ENDPOINT_URL') || this.configService.get<string>('B2_ENDPOINT');

    if (b2KeyId && b2Key && b2Bucket && b2Endpoint) {
      // Validate Backblaze B2 credentials format
      if (b2KeyId.trim().length === 0 || b2Key.trim().length === 0) {
        this.logger.error('❌ Backblaze B2 credentials are empty. Please check your .env file.');
        this.fallbackToLocalStorage();
        return;
      }

      // Validate endpoint format
      if (!b2Endpoint.startsWith('https://')) {
        this.logger.error(`❌ Invalid Backblaze B2 endpoint format: ${b2Endpoint}`);
        this.logger.error('   Endpoint should start with https:// (e.g., https://s3.us-west-004.backblazeb2.com)');
        this.fallbackToLocalStorage();
        return;
      }

      try {
        // Backblaze B2 Configuration (S3-compatible)
        this.s3Client = new S3Client({
          region: 'us-west-004', // Backblaze B2 uses this region
          endpoint: b2Endpoint,
          credentials: {
            accessKeyId: b2KeyId.trim(),
            secretAccessKey: b2Key.trim(),
          },
          forcePathStyle: true, // Required for Backblaze B2
        });
        this.bucketName = b2Bucket.trim();
        this.endpoint = b2Endpoint.trim();
        this.storageType = 'b2';
        this._isCloudStorageConfigured = true;
        this.logger.log('✅ Backblaze B2 configured (S3-compatible)');
        this.logger.log(`   Bucket: ${b2Bucket}`);
        this.logger.log(`   Endpoint: ${b2Endpoint}`);
        this.logger.log(`   Key ID: ${b2KeyId.substring(0, 8)}...${b2KeyId.substring(b2KeyId.length - 4)} (masked)`);
      } catch (error) {
        this.logger.error('❌ Failed to initialize Backblaze B2 client:', error.message);
        this.logger.error('   Please verify your B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY in .env');
        this.fallbackToLocalStorage();
      }
    } else {
      this.fallbackToLocalStorage();
    }
  }

  private fallbackToLocalStorage() {
    this.storageType = 'local';
    this._isCloudStorageConfigured = true; // Set to true for local storage

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(this.localStoragePath)) {
      fs.mkdirSync(this.localStoragePath, { recursive: true });
    }

    this.logger.warn('⚠️  Using LOCAL file storage (development mode)');
    this.logger.warn(`   Files will be stored in: ${this.localStoragePath}`);
    this.logger.warn('   For production, configure Backblaze B2 or Azure Blob Storage');
  }

  public isCloudStorageConfigured(): boolean {
    return this._isCloudStorageConfigured;
  }

  /**
   * Upload a file to cloud storage (Backblaze B2)
   * @param file - File buffer and metadata
   * @param folder - Folder path in bucket (e.g., 'submissions', 'avatars')
   * @param userId - User ID for organizing files
   * @returns Public URL of the uploaded file
   */
  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'uploads',
    userId?: string,
  ): Promise<{ url: string; key: string; size: number }> {
    if (!this._isCloudStorageConfigured) {
      const errorMsg = 'Storage is not configured properly.';
      this.logger.error(`❌ ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }

    // Generate unique filename
    const fileExtension = file.originalname.split('.').pop() || 'bin';
    const uniqueFileName = `${uuidv4()}.${fileExtension}`;

    // Build file path: folder/userId/filename or folder/filename
    const fileKey = userId
      ? `${folder}/${userId}/${uniqueFileName}`
      : `${folder}/${uniqueFileName}`;

    try {
      if (this.storageType === 'local') {
        // Local file storage (development mode)
        const fullPath = path.join(this.localStoragePath, fileKey);
        const directory = path.dirname(fullPath);

        // Create directory if it doesn't exist
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
        }

        // Write file to disk
        fs.writeFileSync(fullPath, file.buffer);

        // Generate local URL
        const baseUrl = this.configService.get<string>('API_BASE_URL') || 'http://localhost:3002';
        const publicUrl = `${baseUrl}/uploads/${fileKey}`;

        this.logger.log(`✅ File uploaded locally: ${fileKey}`);
        this.logger.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
        this.logger.log(`   Path: ${fullPath}`);

        return {
          url: publicUrl,
          key: fileKey,
          size: file.size,
        };
      } else if (this.storageType === 'b2' && this.s3Client && this.bucketName) {
        // Backblaze B2 upload (S3-compatible)
        if (!this.s3Client) {
          const errorMsg = 'S3 client is not initialized. Please check your storage configuration.';
          this.logger.error(`❌ ${errorMsg}`);
          throw new BadRequestException(errorMsg);
        }

        const upload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: this.bucketName,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype || 'application/octet-stream',
            Metadata: {
              originalName: file.originalname,
              uploadedAt: new Date().toISOString(),
            },
          },
        });

        await upload.done();

        // Generate public URL (Backblaze B2)
        const publicUrl = `${this.endpoint}/${this.bucketName}/${fileKey}`;

        this.logger.log(`✅ File uploaded successfully: ${fileKey}`);
        this.logger.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
        this.logger.log(`   URL: ${publicUrl}`);

        return {
          url: publicUrl,
          key: fileKey,
          size: file.size,
        };
      } else {
        throw new BadRequestException('Storage client is not properly initialized');
      }
    } catch (error) {
      this.logger.error(`❌ Failed to upload file: ${error.message}`);
      this.logger.error(`   Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);

      // Provide more helpful error messages
      let errorMessage = `Failed to upload file: ${error.message}`;
      if (error.message.includes('Malformed Access Key Id') || error.message.includes('InvalidAccessKeyId')) {
        errorMessage = 'Invalid storage credentials. Please check your storage configuration in your .env file.';
        this.logger.error('   💡 Tip: Make sure your storage credentials are correct and not empty.');
      } else if (error.message.includes('SignatureDoesNotMatch')) {
        errorMessage = 'Storage authentication failed. Please verify your storage credentials in .env file.';
        this.logger.error('   💡 Tip: Check that your storage credentials match your storage account.');
      } else if (error.message.includes('NoSuchBucket')) {
        errorMessage = `Storage bucket not found. Please verify your bucket name in .env file.`;
        this.logger.error(`   💡 Tip: Make sure the bucket exists in your storage account.`);
      } else if (error.message.includes('endpoint')) {
        errorMessage = 'Invalid storage endpoint. Please check your storage endpoint configuration in .env file.';
        this.logger.error('   💡 Tip: Verify your storage endpoint URL is correct.');
      }

      throw new BadRequestException(errorMessage);
    }
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(
    files: Express.Multer.File[],
    folder: string = 'uploads',
    userId?: string,
  ): Promise<Array<{ url: string; key: string; size: number; originalName: string }>> {
    const uploadPromises = files.map(file =>
      this.uploadFile(file, folder, userId).then(result => ({
        ...result,
        originalName: file.originalname,
      }))
    );

    return Promise.all(uploadPromises);
  }

  /**
   * Get storage information for debugging
   */
  getStorageInfo(): {
    configured: boolean;
    type: 'b2' | 'local' | null;
    bucket: string | null;
    endpoint: string | null;
  } {
    return {
      configured: this._isCloudStorageConfigured,
      type: this.storageType,
      bucket: this.bucketName,
      endpoint: this.endpoint,
    };
  }
}