import * as fs from 'fs';
import * as path from 'path';
import * as stream from 'stream';
import * as http from 'http';
import * as https from 'https';
import { promisify } from 'util';
import { configManager } from './config';
import { logger } from './logger';

const pipeline = promisify(stream.pipeline);

export enum CacheStatus {
    NotCached = 'not_cached',
    Downloading = 'downloading',
    Ready = 'ready',
    Error = 'error'
}

interface CacheEntry {
    relativePath: string;
    status: CacheStatus;
    error?: string;
}

export class ContentCacheManager {
    private cacheDir: string;
    private activeDownloads: Set<string> = new Set();
    private cacheEntries: Map<string, CacheEntry> = new Map();

    constructor() {
        // Use a cache directory in the user's home or app data
        const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
        this.cacheDir = path.join(homeDir, '.pds-cache');
        this.ensureCacheDir();
    }

    private ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }

    public getLocalPath(url: string): string | null {
        const relativePath = this.getRelativePathFromUrl(url);
        if (!relativePath) return null;

        const localPath = path.join(this.cacheDir, relativePath);
        if (fs.existsSync(localPath)) {
            return localPath;
        }
        return null;
    }

    public getCacheStatus(url: string): CacheStatus {
        const relativePath = this.getRelativePathFromUrl(url);
        if (!relativePath) return CacheStatus.NotCached;

        const entry = this.cacheEntries.get(url);
        if (entry) {
            return entry.status;
        }

        // Check if file exists
        const localPath = path.join(this.cacheDir, relativePath);
        if (fs.existsSync(localPath)) {
            return CacheStatus.Ready;
        }

        return CacheStatus.NotCached;
    }

    public async waitForCache(url: string, maxWaitMs: number = 300000): Promise<string | null> {
        if (!this.isCacheable(url)) {
            return null; // Not a cacheable URL
        }

        const startTime = Date.now();
        const checkInterval = 1000; // Check every second

        while (Date.now() - startTime < maxWaitMs) {
            const status = this.getCacheStatus(url);

            if (status === CacheStatus.Ready) {
                return this.getLocalPath(url);
            } else if (status === CacheStatus.Error) {
                logger.warn(`Video caching failed for: ${url}`);
                return null;
            }

            // Still downloading, wait a bit
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        logger.warn(`Timeout waiting for video cache: ${url}`);
        return null;
    }

    public async syncPlaylist(items: any[]): Promise<void> {
        // Run in background to not block playback
        this.syncPlaylistInternal(items).catch(err => {
            logger.error(`Background sync failed: ${err.message}`);
        });
    }

    private async syncPlaylistInternal(items: any[]): Promise<void> {
        logger.info('Starting background sync of playlist content...');
        const config = configManager.get();
        const baseUrl = config.serverUrl.endsWith('/') ? config.serverUrl.slice(0, -1) : config.serverUrl;

        const activeFiles = new Set<string>();

        for (const item of items) {
            if (!item.content || !item.content.url) continue;
            
            let url = item.content.url;
            if (!this.isCacheable(url)) continue;

            const relativePath = this.getRelativePathFromUrl(url);
            if (!relativePath) continue;

            activeFiles.add(relativePath);
            const localPath = path.join(this.cacheDir, relativePath);
            const localDir = path.dirname(localPath);

            // Ensure directory exists
            if (!fs.existsSync(localDir)) {
                fs.mkdirSync(localDir, { recursive: true });
            }

            // Check if file exists or is already downloading
            // Use a unique key for active downloads to avoid collisions
            const downloadKey = relativePath;
            if (!fs.existsSync(localPath) && !this.activeDownloads.has(downloadKey)) {
                const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

                // Mark as downloading
                this.cacheEntries.set(url, {
                    relativePath,
                    status: CacheStatus.Downloading
                });

                this.activeDownloads.add(downloadKey);
                try {
                    if (relativePath.endsWith('index.html')) {
                        await this.downloadVideoWrapper(fullUrl, localPath, baseUrl);
                    } else {
                        logger.info(`Downloading ${path.basename(localPath)}...`);
                        await this.downloadFile(fullUrl, localPath);
                        logger.info(`✅ Downloaded ${path.basename(localPath)}`);
                    }

                    // Mark as ready
                    this.cacheEntries.set(url, {
                        relativePath,
                        status: CacheStatus.Ready
                    });
                } catch (err: any) {
                    logger.error(`Failed to download ${fullUrl}: ${err.message}`);

                    // Mark as error
                    this.cacheEntries.set(url, {
                        relativePath,
                        status: CacheStatus.Error,
                        error: err.message
                    });
                } finally {
                    this.activeDownloads.delete(downloadKey);
                }
            } else if (fs.existsSync(localPath)) {
                // Already cached
                this.cacheEntries.set(url, {
                    relativePath,
                    status: CacheStatus.Ready
                });
            }
        }

        this.cleanup(activeFiles);
    }

    private cleanup(activeFiles: Set<string>) {
        try {
            // Helper to recursively clean
            const cleanDir = (dir: string, relativeRoot: string) => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                let isEmpty = true;

                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    const relPath = path.join(relativeRoot, entry.name);

                    if (entry.isDirectory()) {
                        if (cleanDir(fullPath, relPath)) {
                            fs.rmdirSync(fullPath);
                        } else {
                            isEmpty = false;
                        }
                    } else {
                        // Keep if in activeFiles OR if it's a video file in an active wrapper folder
                        // If activeFiles has "GUID/index.html", we keep "GUID/video.mp4" too.
                        const parentDir = path.dirname(relPath);
                        const parentIndex = path.join(parentDir, 'index.html');
                        
                        const keep = activeFiles.has(relPath) || 
                                   (activeFiles.has(parentIndex) && !entry.name.endsWith('.tmp'));

                        if (!keep && !entry.name.endsWith('.tmp')) {
                            logger.info(`Removing unused cache file: ${relPath}`);
                            try {
                                fs.unlinkSync(fullPath);
                            } catch (e) { /* ignore */ }
                        } else {
                            isEmpty = false;
                        }
                    }
                }
                return isEmpty;
            };

            cleanDir(this.cacheDir, '');
        } catch (e: any) {
            logger.error(`Cache cleanup failed: ${e.message}`);
        }
    }

    public isCacheable(url: string): boolean {
        const lower = url.toLowerCase();
        const ext = path.extname(lower);
        if (['.mp4', '.webm', '.mkv', '.avi', '.mov'].includes(ext)) return true;
        if (lower.includes('/videos/') && lower.endsWith('/index.html')) return true;
        return false;
    }

    private getRelativePathFromUrl(url: string): string | null {
        try {
            // Check for new video wrapper format: .../videos/{guid}/index.html
            const videoWrapperMatch = url.match(/\/videos\/([a-f0-9-]+)\/index\.html$/i);
            if (videoWrapperMatch) {
                return path.join(videoWrapperMatch[1], 'index.html');
            }

            // Handle standard /path/to/file.mp4
            const parts = url.split('/');
            return parts[parts.length - 1];
        } catch {
            return null;
        }
    }

    private async downloadVideoWrapper(url: string, localHtmlPath: string, baseUrl: string): Promise<void> {
        const localDir = path.dirname(localHtmlPath);
        
        // 1. Download HTML content
        const htmlContent = await this.fetchText(url);
        
        // 2. Find video src
        const srcMatch = htmlContent.match(/<video[^>]+src="([^"]+)"/);
        if (!srcMatch) {
            throw new Error('No video src found in wrapper HTML');
        }
        const videoFilename = srcMatch[1];
        const videoUrl = new URL(videoFilename, url).toString();
        const localVideoPath = path.join(localDir, videoFilename);

        // 3. Download video if missing
        if (!fs.existsSync(localVideoPath)) {
            logger.info(`Downloading wrapper video: ${videoFilename}...`);
            await this.downloadFile(videoUrl, localVideoPath);
            logger.info(`✅ Downloaded ${videoFilename}`);
        }

        // 4. Save HTML
        fs.writeFileSync(localHtmlPath, htmlContent);
    }

    private fetchText(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            protocol.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}`));
                    return;
                }
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const tmpDest = `${dest}.tmp`;
        const file = fs.createWriteStream(tmpDest);
        
        return new Promise((resolve, reject) => {
            const protocol = url.startsWith('https') ? https : http;
            
            const request = protocol.get(url, (response) => {
                if (response.statusCode !== 200) {
                    fs.unlink(tmpDest, () => {}); // Delete tmp file
                    reject(new Error(`HTTP ${response.statusCode} ${response.statusMessage}`));
                    return;
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10);
                let downloadedSize = 0;
                let lastLoggedPercent = 0;

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length;
                    if (totalSize > 0) {
                        const percent = Math.floor((downloadedSize / totalSize) * 100);
                        // Log every 10%
                        if (percent >= lastLoggedPercent + 10) {
                            logger.info(`Downloading ${path.basename(dest)}: ${percent}% (${(downloadedSize / 1024 / 1024).toFixed(1)} MB)`);
                            lastLoggedPercent = percent;
                        }
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        // Rename tmp to final
                        fs.rename(tmpDest, dest, (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });
                });
            });

            request.on('error', (err) => {
                fs.unlink(tmpDest, () => {}); // Delete tmp file
                reject(err);
            });

            // Set a long timeout (1 hour)
            request.setTimeout(3600000, () => {
                request.destroy();
                fs.unlink(tmpDest, () => {}); // Delete tmp file
                reject(new Error('Download timeout'));
            });
        });
    }
}

export const contentCacheManager = new ContentCacheManager();
