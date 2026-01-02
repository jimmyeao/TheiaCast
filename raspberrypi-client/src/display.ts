import puppeteer, { Browser, Page } from 'puppeteer';
import { configManager } from './config';
import { logger } from './logger';
import { screenshotManager } from './screenshot';
import { websocketClient } from './websocket';
import { playlistExecutor } from './playlist-executor';

class DisplayController {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private currentUrl: string = '';
  private isInitialized = false;
  private screencastClient: any | null = null;
  private isScreencastActive = false;
  private lastScreencastFrameAt: number = 0;
  private screencastWatchdogId: NodeJS.Timeout | null = null;
  private frameNavigatedHandler: (() => Promise<void>) | null = null;
  private isRestartingScreencast = false;
  private firstFrameTimeoutId: NodeJS.Timeout | null = null;
  private crashRecoveryAttempts = 0;
  private lastCrashTime = 0;
  private maxCrashRecoveryAttempts = 3;

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Display controller already initialized');
      return;
    }

    try {
      logger.info('Initializing display controller...');

      // Kill any existing Chromium processes to prevent "Opening in existing browser session" error
      await this.killExistingChromiumProcesses();

      // Get latest configuration (may have been updated remotely)
      const config = configManager.get();
      logger.info(`Display configuration: ${config.displayWidth}x${config.displayHeight}, Kiosk: ${config.kioskMode}`);

      // Use a persistent directory in the user's home folder instead of /tmp (which is wiped on reboot)
      const homeDir = process.env.HOME || process.env.USERPROFILE || '/root';
      const profileDir = process.platform === 'win32'
        ? `${process.env.LOCALAPPDATA || 'C:/Users/Public/AppData/Local'}/PDS/browser-profile`
        : `${homeDir}/.pds-browser-profile`;

      // Ensure profile directory exists so Chromium can persist cookies/sessions
      try {
        const fs = await import('fs');
        const path = await import('path');
        const dirPath = path.resolve(profileDir);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
          logger.info(`Created browser profile directory: ${dirPath}`);
        } else {
          logger.info(`Using existing browser profile directory: ${dirPath}`);
        }
      } catch (e: any) {
        logger.warn(`Could not ensure profile directory: ${e?.message || e}`);
      }

      const launchOptions: any = {
        headless: false,
        // Use persistent profile unless NO_PROFILE env var is set (for troubleshooting)
        ...(process.env.NO_PROFILE !== 'true' && { userDataDir: profileDir }),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--no-first-run',
          '--no-zygote',
          // Enable GPU/WebGL for proper rendering of certain pages/cards
          '--ignore-gpu-blocklist',
          '--enable-webgl',
          '--enable-accelerated-2d-canvas',
          ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []),
          ...(process.platform === 'linux'
            ? [
                // Raspberry Pi / Linux: prefer EGL + hardware acceleration (X11-compatible)
                '--use-gl=egl',
                '--enable-gpu-rasterization',
                '--enable-zero-copy',
                '--autoplay-policy=no-user-gesture-required',
                // Memory optimization for Raspberry Pi
                '--disable-gpu-shader-disk-cache',
                '--disable-software-rasterizer',
                '--js-flags=--max-old-space-size=512', // Limit V8 heap to 512MB
                '--enable-low-end-device-mode',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions',
                '--disable-sync',
                // Avoid Wayland-only flags since DISPLAY=:0 indicates X11
              ]
            : []),
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-session-crashed-bubble',
          '--disable-features=TranslateUI,WebAuthentication,WebAuth,ClientSideDetectionModel', // Removed AudioServiceOutOfProcess to fix sound
          '--disable-blink-features=WebAuthentication', // Disable at Blink level too
          '--new-instance', // Force new instance instead of connecting to existing
          '--user-agent=Mozilla/5.0 (X11; Linux armv7l) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          '--disable-renderer-backgrounding',
          '--force-device-scale-factor=1', // Force 1:1 scaling
          '--high-dpi-support=1',
          '--force-color-profile=srgb',
          `--window-size=${config.displayWidth},${config.displayHeight}`,
          `--window-position=0,0`,
          '--new-window',
          '--start-fullscreen', // Force fullscreen mode
          '--autoplay-policy=no-user-gesture-required', // Allow autoplay with sound
          '--no-user-gesture-required', // Additional flag for autoplay
          '--disable-gesture-requirement-for-media-playback',
          // Enable caching for better video performance (1GB cache)
          '--disk-cache-size=1073741824', 
          '--media-cache-size=1073741824', 
        ],
        ignoreDefaultArgs: ['--enable-automation', '--mute-audio'], // Ensure audio is not muted
        defaultViewport: null, // Use window size instead of viewport
        env: {
          ...process.env,
          DISPLAY: process.env.DISPLAY || ':0',
        },
      };

      // Use custom Chromium path if provided (e.g., system chromium on Raspberry Pi)
      if (config.puppeteerExecutablePath) {
        launchOptions.executablePath = config.puppeteerExecutablePath;
        logger.info(`Using custom Chromium path: ${config.puppeteerExecutablePath}`);
      }

      // Add kiosk mode args if enabled
      if (config.kioskMode) {
        launchOptions.args.push(
          '--kiosk',
          '--start-fullscreen',
          '--disable-infobars',
          '--disable-session-crashed-bubble'
        );
      }

      // Enable popup debugging
      launchOptions.args.push('--disable-popup-blocking');

      this.browser = await puppeteer.launch(launchOptions);
      logger.info('Browser launched successfully');

      this.page = await this.browser.newPage();
      
      // Explicitly enable cache
      await this.page.setCacheEnabled(true);

      try {
        await this.page.bringToFront();
        await this.page.goto('about:blank');
        await this.page.evaluate(() => {
          // @ts-ignore
          window.focus();
        });
      } catch {}

      // Set viewport to match window size (for screenshots and page rendering)
      await this.page.setViewport({
        width: config.displayWidth,
        height: config.displayHeight,
        deviceScaleFactor: 1,
      });

      logger.info(`Viewport set to: ${config.displayWidth}x${config.displayHeight} with deviceScaleFactor=1`);

      // Inject CSS to hide scrollbars globally and enforce video settings
      await this.page.evaluateOnNewDocument(() => {
        // @ts-ignore
        const style = document.createElement('style');
        style.innerHTML = `
          ::-webkit-scrollbar { 
            display: none; 
            width: 0 !important;
            height: 0 !important;
          }
          body { 
            -ms-overflow-style: none; 
            scrollbar-width: none; 
            overflow: hidden;
            margin: 0 !important;
            padding: 0 !important;
            background-color: black !important;
          }
          video {
            object-fit: contain !important;
            width: 100vw !important;
            height: 100vh !important;
          }
        `;
        // @ts-ignore
        document.head.appendChild(style);

        // Force video settings (autoplay, loop, unmute)
        // @ts-ignore
        function enforceVideoSettings() {
            // @ts-ignore
            const videos = document.getElementsByTagName('video');
            for (let i = 0; i < videos.length; i++) {
                const v = videos[i];
                if (!v.loop) v.loop = true;
                if (v.muted) v.muted = false;
                // Try to play if paused
                if (v.paused) {
                    v.play().catch(() => {});
                }
            }
        }

        // Run periodically to catch dynamically added videos
        setInterval(enforceVideoSettings, 1000);
        
        // Run on load
        // @ts-ignore
        window.addEventListener('load', enforceVideoSettings);
      });

      // Log actual browser dimensions and device pixel ratio
      const browserInfo = await this.page.evaluate(() => {
        // @ts-ignore - Code runs in browser context
        return {
          // @ts-ignore
          windowWidth: window.innerWidth,
          // @ts-ignore
          windowHeight: window.innerHeight,
          // @ts-ignore
          screenWidth: window.screen.width,
          // @ts-ignore
          screenHeight: window.screen.height,
          // @ts-ignore
          devicePixelRatio: window.devicePixelRatio,
          // @ts-ignore
          outerWidth: window.outerWidth,
          // @ts-ignore
          outerHeight: window.outerHeight,
        };
      });
      logger.info('Browser dimensions:', JSON.stringify(browserInfo, null, 2));

      // Force zoom to 100% if it's not already
      await this.page.evaluate(() => {
        // @ts-ignore
        document.body.style.zoom = '100%';
      });

      // Hide automation indicators
      await this.page.evaluateOnNewDocument(() => {
        // @ts-ignore - All code runs in browser context
        Object.defineProperty(navigator, 'webdriver', {
          get: () => false,
        });

        // @ts-ignore
        delete (navigator as any).__proto__.webdriver;

        // @ts-ignore
        (globalThis as any).chrome = {
          runtime: {},
        };

        // @ts-ignore
        const originalQuery = (globalThis as any).navigator.permissions.query;
        (globalThis as any).navigator.permissions.query = (parameters: any) => (
          parameters.name === 'notifications' ?
            Promise.resolve({ state: (globalThis as any).Notification.permission }) :
            originalQuery(parameters)
        );

        // AGGRESSIVELY disable WebAuthn to prevent OS-level security key popups
        // This forces sites (like Microsoft/Google) to fall back to password/MFA forms
        try {
            // @ts-ignore
            if (window.navigator.credentials) {
                // @ts-ignore
                window.navigator.credentials.create = function() {
                    return Promise.reject(new DOMException("NotAllowedError", "WebAuthn is disabled"));
                };
                // @ts-ignore
                window.navigator.credentials.get = function() {
                    return Promise.reject(new DOMException("NotAllowedError", "WebAuthn is disabled"));
                };
            }
            // @ts-ignore
            delete window.PublicKeyCredential;
        } catch (e) {}
      });

      logger.info('Page created with viewport set');

      // Set screenshot manager page reference
      screenshotManager.setPage(this.page);

      // Setup page error handlers
      this.setupErrorHandlers();

      // Listen for new pages (popups) to handle authentication windows
      this.browser.on('targetcreated', async (target) => {
        logger.info(`Target created: ${target.type()} - ${target.url()}`);
        
        // Handle both 'page' and 'other' (sometimes popups start as 'other')
        if (target.type() === 'page' || target.type() === 'other') {
          try {
            const newPage = await target.page();
            if (newPage && newPage !== this.page) {
              logger.info(`New page detected (type: ${target.type()}), switching control...`);
              await this.handlePageChange(newPage);
            } else if (!newPage) {
                logger.debug(`Target ${target.type()} created but no page object available yet.`);
                
                // If it's 'other', it might become a page later, so we can try to attach to it
                if (target.type() === 'other') {
                    // Wait a bit and check again
                    setTimeout(async () => {
                        try {
                            const p = await target.page();
                            if (p && p !== this.page) {
                                logger.info('Target "other" became a page, switching...');
                                await this.handlePageChange(p);
                            }
                        } catch (e) {}
                    }, 1000);
                }
            }
          } catch (e) {
            logger.warn('Failed to get page from target:', e);
          }
        }
      });

      // Poll for page changes (fallback for missed events)
      setInterval(async () => {
        if (!this.browser) return;
        try {
            const pages = await this.browser.pages();
            // If we have multiple pages, assume the last one is the active popup
            if (pages.length > 1) {
                const lastPage = pages[pages.length - 1];
                if (lastPage && lastPage !== this.page) {
                    logger.info(`Found new active page via polling (total: ${pages.length}), switching...`);
                    await this.handlePageChange(lastPage);
                }
            } else if (pages.length === 1 && pages[0] !== this.page) {
                // Should rarely happen, but if we lost track
                await this.handlePageChange(pages[0]);
            }
        } catch (e) {
            // Ignore polling errors
        }
      }, 2000);

      this.browser.on('targetdestroyed', async (target) => {
        if (target.type() === 'page') {
          logger.info('Page destroyed, checking for remaining pages...');
          const pages = await this.browser?.pages();
          if (pages && pages.length > 0) {
            // Switch to the last remaining page
            const lastPage = pages[pages.length - 1];
            if (lastPage && lastPage !== this.page) {
               await this.handlePageChange(lastPage);
            }
          }
        }
      });

      // Don't start screencast automatically - wait for admin to request it
      // This prevents sending frames when no one is watching (causes backpressure and stalls)
      logger.info('Display ready - screencast will start when admin connects');

      this.isInitialized = true;
      logger.info('✅ Display controller initialized');
    } catch (error: any) {
      logger.error('Failed to initialize display controller:', error.message);
      websocketClient.sendErrorReport(
        'Display initialization failed',
        error.stack
      );
      throw error;
    }
  }

  private async handlePageChange(newPage: Page): Promise<void> {
    logger.info('Switching active page control');
    this.page = newPage;
    
    const config = configManager.get();
    
    try {
        // Bring to front
        await this.page.bringToFront().catch(() => {});
        
        // Set viewport
        await this.page.setViewport({
            width: config.displayWidth,
            height: config.displayHeight,
            deviceScaleFactor: 1,
        }).catch(e => logger.warn('Failed to set viewport on new page:', e));
        
        // Setup handlers
        this.setupErrorHandlers();
        
        // Update screenshot manager
        screenshotManager.setPage(this.page);
        
        // Restart screencast if active
        if (this.isScreencastActive) {
            logger.info('Restarting screencast on new page');
            // Force cleanup of the old session so startScreencast creates a new one for the new page
            this.screencastClient = null;
            // We need to reset the restarting flag to allow startScreencast to run
            this.isRestartingScreencast = false; 
            this.startScreencast().catch(e => logger.error('Failed to restart screencast:', e));
        }
    } catch (error) {
        logger.error('Error handling page change:', error);
    }
  }

  public async startScreencast(): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot start screencast: page not initialized');
      return;
    }

    // Check if page is closed (can happen after backend restart)
    if (this.page.isClosed()) {
      logger.warn('Page is closed, cannot start screencast. Browser may need to be reinitialized.');
      return;
    }

    // Prevent concurrent restarts
    if (this.isRestartingScreencast) {
      logger.warn('Screencast restart already in progress, skipping...');
      return;
    }

    if (this.isScreencastActive && this.screencastClient) {
      logger.info('Screencast already active and healthy');
      return;
    }

    this.isRestartingScreencast = true;

    try {
      logger.info('Starting CDP screencast for live streaming...');

      // Get latest configuration
      const config = configManager.get();

      // Clear any pending first-frame timeout
      if (this.firstFrameTimeoutId) {
        clearTimeout(this.firstFrameTimeoutId);
        this.firstFrameTimeoutId = null;
      }

      // Clean up old session if it exists (without triggering events)
      if (this.screencastClient) {
        try {
          // Remove all listeners before detaching to prevent cascade
          this.screencastClient.removeAllListeners();
          await this.screencastClient.send('Page.stopScreencast').catch(() => {});
          await this.screencastClient.detach().catch(() => {});
        } catch (e) {
          // Ignore cleanup errors
        }
        this.screencastClient = null;
      }

      // Verify page is still valid before creating CDP session
      if (this.page.isClosed()) {
        throw new Error('Page was closed during screencast initialization');
      }

      // Get NEW CDP session (recreating fixes disconnection issues)
      const client = await this.page.target().createCDPSession();
      this.screencastClient = client;

      // Add disconnect handler (but don't trigger immediate restart to prevent loop)
      client.on('sessiondetached', () => {
        logger.warn('CDP session detached unexpectedly');
        // Don't set isScreencastActive = false here - let watchdog handle it
        if (this.screencastClient === client) {
          this.screencastClient = null;
        }
      });

      // Ensure Page domain is enabled
      try {
        await client.send('Page.enable');
      } catch (e: any) {
        logger.warn(`Could not enable Page domain: ${e?.message || e}`);
      }

      // Start screencast with optimized settings
      // everyNthFrame: 2 captures every other frame to reduce CPU/bandwidth load
      // On-demand mode prevents backpressure since we only stream when admin is watching

      // Ensure dimensions are valid integers (fix "int32 value expected" error)
      const maxWidth = Math.floor(config.displayWidth || 1920);
      const maxHeight = Math.floor(config.displayHeight || 1080);

      // Validate dimensions are within reasonable bounds (int32 range)
      const safeMaxWidth = Math.max(1, Math.min(maxWidth, 4096));
      const safeMaxHeight = Math.max(1, Math.min(maxHeight, 4096));

      try {
        await client.send('Page.startScreencast', {
          format: 'jpeg',
          quality: 60, // Reduced from 80 to improve performance
          maxWidth: safeMaxWidth,
          maxHeight: safeMaxHeight,
          // REMOVED everyNthFrame to capture ALL frames (critical for static pages with repaint-forcer)
          // The repaint-forcer generates ~10fps, so we need to capture every frame
        });
      } catch (e: any) {
        logger.error('Failed to start screencast with params:', {
          maxWidth: safeMaxWidth,
          maxHeight: safeMaxHeight,
          error: e?.message || e
        });
        throw e; // Re-throw to be caught by outer try-catch
      }

      let firstFrameReceived = false;

      // Track frame count for debugging
      let frameCount = 0;

      // Listen for screencast frames
      client.on('Page.screencastFrame', async (frame: any) => {
        try {
          frameCount++;

          if (!firstFrameReceived) {
            firstFrameReceived = true;
            logger.info('✅ First screencast frame received - streaming active');
            // Clear the timeout since we got a frame
            if (this.firstFrameTimeoutId) {
              clearTimeout(this.firstFrameTimeoutId);
              this.firstFrameTimeoutId = null;
            }
          }

          // Log every 50th frame to track activity
          if (frameCount % 50 === 0) {
            logger.info(`Screencast streaming: ${frameCount} frames sent`);
          }

          this.lastScreencastFrameAt = Date.now();

          // Send frame to server via WebSocket
          websocketClient.sendScreencastFrame({
            data: frame.data,
            metadata: {
              sessionId: frame.sessionId,
              timestamp: Date.now(),
              width: frame.metadata.deviceWidth || config.displayWidth,
              height: frame.metadata.deviceHeight || config.displayHeight,
            },
          });

          // Acknowledge frame to continue receiving
          try {
            await client.send('Page.screencastFrameAck', {
              sessionId: frame.sessionId,
            });
          } catch (ackError: any) {
            logger.error('Frame acknowledgment failed:', ackError.message);
            // Don't throw - try to continue
          }
        } catch (error: any) {
          logger.error('Error handling screencast frame:', error.message, error.stack);
          // Don't re-throw to prevent breaking the event listener
        }
      });

      // Mark as active BEFORE setting timeout
      this.isScreencastActive = true;
      this.isRestartingScreencast = false;

      // Force periodic repaints for static pages to ensure CDP screencast generates frames
      // This solves the issue where completely static pages don't generate any frames
      try {
        await this.page.evaluate(() => {
          // Remove any existing force-repaint elements
          const existingElement = document.getElementById('__screencast_force_repaint__');
          if (existingElement) {
            existingElement.remove();
          }
          const existingStyle = document.getElementById('__screencast_force_repaint_style__');
          if (existingStyle) {
            existingStyle.remove();
          }

          // Inject CSS animation keyframes
          const style = document.createElement('style');
          style.id = '__screencast_force_repaint_style__';
          style.textContent = `
            @keyframes __screencast_pulse__ {
              0% { transform: translateZ(0); }
              50% { transform: translateZ(0.1px); }
              100% { transform: translateZ(0); }
            }
          `;
          document.head.appendChild(style);

          // Create invisible element with CSS animation
          const div = document.createElement('div');
          div.id = '__screencast_force_repaint__';
          div.style.cssText = 'position:fixed;top:-1px;left:-1px;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-9999;animation:__screencast_pulse__ 1s infinite;will-change:transform;';
          document.body.appendChild(div);

          // Additional fallback: Use setInterval to force repaints by modifying transform
          // This ensures repaints even if CSS animation is paused or blocked
          let toggle = 0;
          setInterval(() => {
            toggle = toggle === 0 ? 1 : 0;
            // Use larger transform value and alternate to ensure browser detects change
            div.style.transform = `translate3d(0, 0, ${toggle}px)`;
            // Also force a style recalculation
            void div.offsetHeight;
          }, 100); // Every 100ms = 10fps minimum frame generation
        });
        logger.info('Injected CSS+JS repaint-forcer for static page screencast');
      } catch (e: any) {
        logger.warn('Could not inject repaint-forcer:', e.message);
        // Not critical, continue anyway
      }

      // If no frame arrives within 10 seconds, restart once
      this.firstFrameTimeoutId = setTimeout(async () => {
        if (!firstFrameReceived && this.isScreencastActive) {
          logger.warn('No screencast frames after 10s, attempting restart...');
          this.isScreencastActive = false;
          this.isRestartingScreencast = false;
          await this.startScreencast();
        }
      }, 10000);

      // Start watchdog if not already running
      if (!this.screencastWatchdogId) {
        this.screencastWatchdogId = setInterval(async () => {
          const now = Date.now();

          // Only restart if we're stalled for more than 30 seconds (increased from 15s)
          // With the repaint-forcer, we should get frames regularly even on static pages
          if (this.isScreencastActive && this.lastScreencastFrameAt && now - this.lastScreencastFrameAt > 30000) {
            logger.warn('Screencast stalled (no frames >30s). Restarting...');
            this.isScreencastActive = false;
            this.isRestartingScreencast = false;
            await this.startScreencast();
          }
        }, 10000); // Check every 10 seconds
      }

      // Setup navigation handler (only once)
      // Just log navigation - don't restart screencast, let it continue through navigation
      if (!this.frameNavigatedHandler) {
        this.frameNavigatedHandler = async () => {
          try {
            const now = Date.now();
            const timeSinceLastFrame = this.lastScreencastFrameAt ? now - this.lastScreencastFrameAt : Infinity;
            logger.info(`Frame navigated - screencast active: ${this.isScreencastActive}, last frame: ${timeSinceLastFrame}ms ago`);

            // Don't restart! Let screencast continue through navigation.
            // The watchdog will restart if it actually stalls for >15s

            // Re-emit playback state so admin UI stays in sync after page refresh
            playlistExecutor.refreshState();
          } catch (navErr: any) {
            logger.warn(`Navigation error: ${navErr?.message || navErr}`);
          }
        };
        this.page.on('framenavigated', this.frameNavigatedHandler);
      }

      logger.info('CDP screencast session created, waiting for frames...');
    } catch (error: any) {
      logger.error('Failed to start screencast:', error.message);

      // Only send error report if it's not a parameter validation error (which we've now fixed)
      const isParamError = error.message && error.message.includes('Invalid parameters');
      if (!isParamError) {
        try {
          websocketClient.sendErrorReport('Screencast start failed', error.stack);
        } catch (reportError) {
          logger.warn('Could not send error report:', reportError);
        }
      }

      this.isScreencastActive = false;
      this.isRestartingScreencast = false;

      // Retry after a delay (exponential backoff)
      const retryDelay = 5000; // 5 seconds
      logger.info(`Will retry screencast start in ${retryDelay}ms...`);
      setTimeout(async () => {
        if (!this.isScreencastActive && !this.isRestartingScreencast) {
          logger.info('Attempting screencast recovery...');
          await this.startScreencast().catch(e => {
            logger.error('Screencast recovery failed:', e.message);
          });
        }
      }, retryDelay);
    }
  }

  public async stopScreencast(): Promise<void> {
    logger.info('Stopping screencast...');

    this.isScreencastActive = false;
    this.isRestartingScreencast = false;

    // Clear timeouts
    if (this.firstFrameTimeoutId) {
      clearTimeout(this.firstFrameTimeoutId);
      this.firstFrameTimeoutId = null;
    }

    if (this.screencastWatchdogId) {
      clearInterval(this.screencastWatchdogId);
      this.screencastWatchdogId = null;
    }

    // Clean up CDP session
    if (this.screencastClient) {
      try {
        this.screencastClient.removeAllListeners();
        await this.screencastClient.send('Page.stopScreencast').catch(() => {});
        await this.screencastClient.detach().catch(() => {});
      } catch (e) {
        // Ignore errors during cleanup
      }
      this.screencastClient = null;
    }

    // Remove navigation handler
    if (this.frameNavigatedHandler && this.page) {
      this.page.off('framenavigated', this.frameNavigatedHandler);
      this.frameNavigatedHandler = null;
    }

    logger.info('Screencast stopped');
  }

  private setupErrorHandlers(): void {
    if (!this.page) return;

    this.page.on('error', async (error) => {
      logger.error('Page error:', error.message);
      websocketClient.sendErrorReport('Page error', error.stack);

      // Handle page crashes with automatic recovery
      if (error.message.includes('Page crashed') || error.message.includes('Target closed')) {
        const now = Date.now();
        const timeSinceLastCrash = now - this.lastCrashTime;

        // Reset crash counter if it's been more than 5 minutes since last crash
        if (timeSinceLastCrash > 5 * 60 * 1000) {
          this.crashRecoveryAttempts = 0;
        }

        this.lastCrashTime = now;
        this.crashRecoveryAttempts++;

        logger.warn(`Page crashed! Recovery attempt ${this.crashRecoveryAttempts}/${this.maxCrashRecoveryAttempts}`);

        if (this.crashRecoveryAttempts <= this.maxCrashRecoveryAttempts) {
          // Wait a bit before attempting recovery (exponential backoff)
          const delayMs = Math.min(1000 * Math.pow(2, this.crashRecoveryAttempts - 1), 10000);
          logger.info(`Waiting ${delayMs}ms before attempting page recovery...`);

          await new Promise(resolve => setTimeout(resolve, delayMs));

          try {
            logger.info('Attempting to recover from page crash...');

            // Try to reload the current URL
            if (this.currentUrl) {
              logger.info(`Reloading crashed page: ${this.currentUrl}`);
              await this.navigateTo(this.currentUrl);
              logger.info('Page recovery successful!');
            } else {
              logger.warn('No current URL to reload, waiting for next content update');
            }
          } catch (recoveryError: any) {
            logger.error('Failed to recover from page crash:', recoveryError.message);

            // If recovery fails after max attempts, restart the entire browser
            if (this.crashRecoveryAttempts >= this.maxCrashRecoveryAttempts) {
              logger.error('Max crash recovery attempts reached, restarting browser...');
              websocketClient.sendErrorReport('Browser restart required after repeated crashes', error.stack);

              try {
                await this.shutdown();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.initialize();

                // Reload the last URL if we have one
                if (this.currentUrl) {
                  await this.navigateTo(this.currentUrl);
                }
              } catch (restartError: any) {
                logger.error('Failed to restart browser:', restartError.message);
                websocketClient.sendErrorReport('Critical: Browser restart failed', restartError.stack);
              }
            }
          }
        } else {
          logger.error('Max crash recovery attempts exceeded, manual intervention may be required');
          websocketClient.sendErrorReport('Critical: Repeated page crashes, max recovery attempts exceeded', error.stack);
        }
      }
    });

    this.page.on('pageerror', (error: unknown) => {
      // Filter out common third-party errors that don't affect functionality
      const err = error as Error;
      const errorMessage = err.message.toLowerCase();
      const errorStack = err.stack?.toLowerCase() || '';
      const isNoiseError =
        errorMessage.includes('trustedtypepolicy') ||
        errorMessage.includes('content security policy') ||
        errorMessage.includes('wrongserverexception') ||
        errorMessage.includes('getmastercategorylist') ||
        errorMessage.includes('microsoft.exchange') ||
        errorMessage.includes('cannot read properties of undefined') ||
        errorMessage.includes('resizeobserver loop') ||
        errorMessage.includes('script error') ||
        errorMessage.includes('appendchild') || // Filter out common DOM errors
        errorMessage.includes('mutationobserver') || // Filter out MutationObserver errors (Home Assistant kiosk-mode)
        errorMessage === 'uncaught exception' ||
        errorStack.includes('trustedtypepolicy') ||
        errorStack.includes('content security') ||
        errorStack.includes('wrongserverexception') ||
        errorStack.includes('microsoft.exchange') ||
        errorStack.includes('adsprebid') ||
        errorStack.includes('prebid') ||
        errorStack.includes('analytics') ||
        errorStack.includes('onetrust') || // Filter out OneTrust cookie consent errors
        errorStack.includes('advertisement') ||
        errorStack.includes('imrworldwide.com') ||
        errorStack.includes('kiosk-mode.js'); // Filter out Home Assistant kiosk-mode plugin errors

      if (!isNoiseError) {
        logger.error('Page JavaScript error:', err.message);
        // Send the actual error message instead of a generic title
        websocketClient.sendErrorReport(`JS Error: ${err.message.substring(0, 100)}`, err.stack);
      }
    });

    this.page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();

      // Filter out noisy console errors (404s, 403s, CORS errors from third-party resources)
      const isResourceError =
        text.includes('Failed to load resource') ||
        text.includes('status of 404') ||
        text.includes('status of 403') ||
        text.includes('TrustedTypePolicy') ||
        text.includes('Content Security') ||
        text.includes('CORS policy') ||
        text.includes('Access to XMLHttpRequest') ||
        text.includes('Access to fetch') ||
        text.includes('blocked by CORS') ||
        text.includes('No \'Access-Control-Allow-Origin\'');

      // Known benign app-specific console errors to ignore
      const isBenignAppError =
        text.includes('<rect> attribute width: A negative value is not valid') ||
        text.toLowerCase().includes('missing queryfn');

      if (type === 'error' && !isResourceError && !isBenignAppError) {
        logger.error(`Page console error: ${text}`);
      }
    });

    // Log request cache status for debugging
    this.page.on('requestfinished', (request) => {
        const response = request.response();
        if (response && request.resourceType() === 'media') {
            const fromCache = response.fromCache();
            const headers = response.headers();
            const size = headers['content-length'] || 'unknown';
            const cacheControl = headers['cache-control'] || 'missing';
            logger.info(`Media request finished: ${request.url().split('/').pop()} - From Cache: ${fromCache} - Size: ${size} - Cache-Control: ${cacheControl}`);
        }
    });
  }

  public async navigateTo(url: string, duration?: number): Promise<void> {
    if (!this.page) {
      logger.error('Cannot navigate: page not initialized');
      return;
    }

    // Resolve relative URLs against the server URL
    // Skip if it's a file:// URL
    if (url.startsWith('/') && !url.startsWith('file://')) {
      const config = configManager.get();
      // Remove trailing slash from serverUrl if present and leading slash from url
      const baseUrl = config.serverUrl.endsWith('/') ? config.serverUrl.slice(0, -1) : config.serverUrl;
      url = `${baseUrl}${url}`;
    }

    try {
      // Clear previous page state by navigating to about:blank if switching from a video or heavy content
      // This helps prevent memory leaks and ensures a clean slate for the next page
      // Only do this if we are actually switching content types, to avoid unnecessary flashing
      const isVideo = url.includes('.mp4') || url.includes('/videos/') || url.startsWith('file://');
      const wasVideo = this.currentUrl.includes('.mp4') || this.currentUrl.includes('/videos/') || this.currentUrl.startsWith('file://');
      const wasBroadcast = this.currentUrl.startsWith('data:text/html');

      // Use about:blank if we are switching AWAY from a video to a web page, or away from a broadcast message
      // This ensures clean transitions and prevents navigation abort errors
      if ((wasVideo && !isVideo) || wasBroadcast) {
          try {
              // Use a shorter timeout and don't wait for full load
              await this.page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 1000 });
              logger.info('Cleared previous page state via about:blank');

              // For broadcasts, clear page state and add delay to prevent navigation conflicts
              if (wasBroadcast) {
                  try {
                      // Evaluate in page context to clear any lingering state
                      await this.page.evaluate(() => {
                          // Clear any timers or intervals from the broadcast page
                          // Note: In the browser context, setTimeout returns a number
                          const highestTimeoutId = setTimeout(() => {}, 0) as unknown as number;
                          for (let i = 0; i < highestTimeoutId; i++) {
                              clearTimeout(i);
                          }
                          const highestIntervalId = setInterval(() => {}, 9999) as unknown as number;
                          for (let i = 0; i < highestIntervalId; i++) {
                              clearInterval(i);
                          }
                      });

                      // Wait longer to ensure broadcast page is fully cleared
                      await new Promise(resolve => setTimeout(resolve, 1000));
                      logger.info('Completed broadcast cleanup, waiting 1 second before navigation');
                  } catch (cleanupError: any) {
                      logger.warn(`Cleanup failed (non-critical): ${cleanupError.message}`);
                  }
              }
          } catch (e) {
              logger.warn('Failed to navigate to about:blank, continuing anyway');
          }
      }

      logger.info(`Navigating to: ${url}${duration ? ` (duration: ${duration}ms)` : ''}`);
      this.currentUrl = url;

      // Determine timeout and wait strategy based on URL
      const requiresAuth = url.includes('outlook.') || url.includes('office.com') || url.includes('microsoft.com');

      // Home Assistant and PWA pages use service workers and never become network idle
      // Use faster timeout and domcontentloaded strategy for better UX
      const isHomeAssistant = url.includes('home-assistant') || url.includes('homeassistant') || url.includes('ha.') || url.includes(':8123') || url.match(/:\d+\/lovelace/);
      const isPWA = isHomeAssistant || url.includes('?kiosk'); // Many PWAs use ?kiosk parameter

      // Set timeout: 60s for auth, 10s for PWA/HA (faster retry), 30s for others
      const timeout = requiresAuth ? 60000 : (isPWA ? 10000 : 30000);

      // Try with networkidle2 first, then fall back to domcontentloaded
      let navigationSuccess = false;

      try {
        // For video files, PWAs, and Home Assistant: use domcontentloaded directly (faster)
        // For other pages: try networkidle2 first for complete loading
        const waitStrategy = (isVideo || isPWA) ? 'domcontentloaded' : 'networkidle2';

        await this.page.goto(url, {
          waitUntil: waitStrategy,
          timeout: timeout,
        });
        navigationSuccess = true;
      } catch (error: any) {
        // Handle abort errors - retry instead of giving up
        if (error.message.includes('net::ERR_ABORTED')) {
            logger.warn(`Navigation aborted: ${error.message}`);

            // ALWAYS retry ERR_ABORTED errors - they can be caused by:
            // - Service workers (Home Assistant uses these heavily)
            // - Redirects that abort the initial navigation
            // - Page still loading when new navigation starts
            // These are usually recoverable with a retry
            const shouldRetry = true;

            // Service workers (especially in Home Assistant) can cause abort errors
            // Try to unregister service workers and retry
            if (shouldRetry) {
                const reason = wasBroadcast ? 'post-broadcast' : (this.currentUrl ? 'playlist-rotation' : 'startup');
                logger.info(`Attempting to unregister service workers and retry navigation (${reason})...`);
                try {
                    // Unregister all service workers via page evaluation
                    await this.page.evaluate(async () => {
                        if ('serviceWorker' in navigator) {
                            const registrations = await navigator.serviceWorker.getRegistrations();
                            for (const registration of registrations) {
                                await registration.unregister();
                                console.log('Unregistered service worker:', registration.scope);
                            }
                        }
                    });
                    logger.info('Service workers unregistered, waiting 500ms before retry...');
                    await new Promise(resolve => setTimeout(resolve, 500));

                    // Retry navigation with more lenient strategy
                    await this.page.goto(url, {
                        waitUntil: 'domcontentloaded',
                        timeout: 30000,
                    });
                    navigationSuccess = true;
                    logger.info('✅ Navigation succeeded after service worker cleanup and retry');
                } catch (retryError: any) {
                    logger.error(`Navigation failed even after retry: ${retryError.message}`);
                    // Continue anyway - the page might still partially load
                    navigationSuccess = true;
                }
            }
        }

        if (error.message.includes('Navigation timeout') || error.message.includes('Timeout')) {
          logger.warn(`Network idle timeout, retrying with domcontentloaded strategy...`);

          // Retry with more lenient wait strategy
          try {
            await this.page.goto(url, {
              waitUntil: 'domcontentloaded',
              timeout: 15000,
            });
            navigationSuccess = true;
            logger.info('Navigation succeeded with domcontentloaded strategy');
          } catch (retryError: any) {
             // Ignore abort errors on retry too
             if (retryError.message.includes('net::ERR_ABORTED')) {
                logger.warn(`Retry navigation aborted: ${retryError.message}`);
                return;
             }

            logger.warn(`Navigation partially succeeded, continuing anyway: ${retryError.message}`);
            // Continue anyway - page might still be usable even if not fully loaded
            navigationSuccess = true;
          }
        } else {
          throw error; // Re-throw non-timeout errors
        }
      }

      if (!navigationSuccess) {
        throw new Error('Navigation failed after retries');
      }

      // For Home Assistant pages, add a small delay to let custom cards and scripts fully initialize
      // This prevents race conditions where HA scripts try to access DOM elements before they're ready
      if (isHomeAssistant) {
        logger.info('Home Assistant detected, waiting 2 seconds for full initialization...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Inject CSS to hide scrollbars, cursor, and style video content
      // Only apply aggressive video-specific styling (black background, full viewport) to actual video content
      // Regular web pages (Home Assistant, dashboards, etc.) should keep their own styling
      try {
        if (isVideo) {
          // AGGRESSIVE FIX for videos: Force black background and full viewport
          await this.page.addStyleTag({
            content: `
              ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
              * { cursor: none !important; }
              html, body {
                overflow: hidden !important;
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
                margin: 0 !important;
                padding: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background-color: black !important;
                cursor: none !important;
              }
              video {
                object-fit: contain !important;
                width: 100vw !important;
                height: 100vh !important;
                max-width: 100% !important;
                max-height: 100% !important;
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
              }
            `
          });
        } else {
          // For regular web pages: Hide scrollbars and cursor for kiosk mode
          await this.page.addStyleTag({
            content: `
              ::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
              * { cursor: none !important; }
              html, body {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
                cursor: none !important;
              }
            `
          });
        }
      } catch (styleError: any) {
        // Style injection can fail if page crashed or DOM not ready - log but continue
        logger.warn('Failed to inject styles (page may have crashed):', styleError?.message || styleError);
      }

      // Only apply video-specific JavaScript for video content
      // Regular web pages (Home Assistant, dashboards) should not be modified
      if (isVideo) {
        // Force page to use full viewport and setup video handling (code runs in browser context via page.evaluate)
        await this.page.evaluate(() => {
          // @ts-ignore
          if (!document.querySelector('meta[name="viewport"]') && document.head) {
            // @ts-ignore
            const meta = document.createElement('meta');
            meta.name = 'viewport';
            meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
            // @ts-ignore
            document.head.appendChild(meta);
          }

          // Simulate user interaction to unlock audio context
          // @ts-ignore
          if (document.body) {
            // @ts-ignore
            document.body.click();
          }

          // Setup robust video handling (works for both HTML wrappers and raw video files)
          // @ts-ignore
          function setupVideoHandling() {
              // @ts-ignore
              const videos = document.getElementsByTagName('video');
              for (let i = 0; i < videos.length; i++) {
                  const v = videos[i];

                  // Ensure loop and audio
                  if (!v.loop) v.loop = true;
                  if (v.muted) v.muted = false;
                  v.volume = 1.0;

                  // Set preload to auto to encourage buffering
                  v.preload = 'auto';
                  v.setAttribute('playsinline', '');
                  v.setAttribute('webkit-playsinline', '');

                  // Add event listeners to keep it alive
                  v.onended = () => { v.currentTime = 0; v.play().catch(() => {}); };
                  v.onpause = () => { if (!v.ended) v.play().catch(() => {}); };

                  // Log buffering issues
                  v.onwaiting = () => { console.log('Video buffering...'); };
                  v.onstalled = () => { console.log('Video stalled!'); v.play().catch(() => {}); };

                  // Try to play
                  v.play().catch(() => {});
              }
          }

          // Run immediately
          setupVideoHandling();

          // Remove the interval to prevent CPU usage and potential playback interference
          // The event listeners (onended, onpause) should handle keeping it alive
          // @ts-ignore
          // setInterval(setupVideoHandling, 5000);

          // Force body and html to use 100% width/height and remove any scaling
          // @ts-ignore
          if (document.documentElement) {
            // @ts-ignore
            document.documentElement.style.cssText = 'width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; background-color: black;';
          }
          // @ts-ignore
          if (document.body) {
            // @ts-ignore
            document.body.style.cssText = 'width: 100vw; height: 100vh; margin: 0; padding: 0; overflow: hidden; zoom: 100%; background-color: black;';
          }
        });
      }

      // Log page dimensions after navigation
      const pageDimensions = await this.page.evaluate(() => {
        // @ts-ignore - Code runs in browser context
        return {
          // @ts-ignore
          windowWidth: window.innerWidth,
          // @ts-ignore
          windowHeight: window.innerHeight,
          // @ts-ignore
          devicePixelRatio: window.devicePixelRatio,
          // @ts-ignore
          bodyWidth: document.body?.offsetWidth || 0,
          // @ts-ignore
          bodyHeight: document.body?.offsetHeight || 0,
        };
      });
      logger.info(`Page dimensions after navigation: ${JSON.stringify(pageDimensions)}`);

      // Check if page is responsive (not crashed/white screen)
      try {
        const isResponsive = await this.page.evaluate(() => {
          // Check if document and body exist
          // @ts-ignore
          return !!(document && document.body);
        });

        if (!isResponsive) {
          logger.warn('Page appears to be in a crashed state (no document or body), triggering recovery...');
          throw new Error('Page crashed');
        }
      } catch (healthCheckError: any) {
        logger.error('Page health check failed, page may have crashed:', healthCheckError.message);
        // Trigger the crash recovery handler
        this.page?.emit('error', new Error('Page crashed'));
        throw healthCheckError;
      }

      this.currentUrl = url;
      logger.info(`✅ Navigation successful: ${url}`);

      // REMOVED: Do not auto-start screencast on navigation
      // Screencast should only be started when explicitly requested by admin via WebSocket

      // REMOVED: Do not wait or log duration here. PlaylistExecutor handles timing.
      // This prevents race conditions and confusing logs.
    } catch (error: any) {
      logger.error(`Navigation failed to ${url}:`, error.message);
      // Only report critical navigation failures; ignore benign aborts caused by redirects or SPA route changes
      const msg = (error.message || '').toLowerCase();
      const isTimeout = msg.includes('navigation timeout') || msg.includes('timeout');
      const isErrAborted = msg.includes('net::err_aborted');
      if (!isTimeout && !isErrAborted) {
        websocketClient.sendErrorReport(
          `Navigation failed to ${url}`,
          error.stack,
          { url }
        );
      }
    }
  }

  public async refresh(force: boolean = false): Promise<void> {
    if (!this.page) {
      logger.error('Cannot refresh: page not initialized');
      return;
    }

    try {
      logger.info(`Refreshing page${force ? ' (hard refresh)' : ''}`);

      await this.page.reload({
        waitUntil: 'networkidle2',
        ...(force && { ignoreCache: true })
      });

      logger.info('✅ Page refreshed');
    } catch (error: any) {
      logger.error('Page refresh failed:', error.message);
      websocketClient.sendErrorReport('Page refresh failed', error.stack);
    }
  }

  public getCurrentUrl(): string {
    return this.currentUrl;
  }

  public getPage(): Page | null {
    return this.page;
  }

  private async killExistingChromiumProcesses(): Promise<void> {
    try {
      const { execSync } = await import('child_process');

      if (process.platform === 'win32') {
        // Windows: kill chrome, chromium, msedge processes
        try {
          execSync('taskkill /F /IM chrome.exe /T', { stdio: 'ignore' });
        } catch {}
        try {
          execSync('taskkill /F /IM chromium.exe /T', { stdio: 'ignore' });
        } catch {}
        try {
          execSync('taskkill /F /IM msedge.exe /T', { stdio: 'ignore' });
        } catch {}
      } else {
        // Linux/Mac: kill chromium, chrome processes
        try {
          execSync('pkill -9 chromium', { stdio: 'ignore' });
        } catch {}
        try {
          execSync('pkill -9 chromium-browser', { stdio: 'ignore' });
        } catch {}
        try {
          execSync('pkill -9 chrome', { stdio: 'ignore' });
        } catch {}
      }

      logger.info('Killed any existing Chromium processes');

      // Wait a moment for processes to fully terminate
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error: any) {
      logger.warn('Error killing existing processes (may not exist):', error.message);
    }
  }

  public async restart(): Promise<void> {
    logger.warn('Restarting display controller...');

    // Save current URL to restore after restart
    const urlToRestore = this.currentUrl;

    await this.shutdown();

    // Wait a bit before reinitializing
    await new Promise(resolve => setTimeout(resolve, 2000));

    await this.initialize();

    // Restore the previous URL if there was one
    if (urlToRestore) {
      logger.info(`Restoring previous URL after restart: ${urlToRestore}`);
      await this.navigateTo(urlToRestore);
    }

    logger.info('✅ Display controller restarted');
  }

  public async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down display controller...');

      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
        this.isInitialized = false;
        logger.info('Browser closed');
      }
    } catch (error: any) {
      logger.error('Error during shutdown:', error.message);
    }
  }

  // Remote control methods
  public async remoteClick(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot perform remote click: page not initialized');
      return;
    }

    try {
      logger.info(`Remote click at (${x}, ${y}) with ${button} button`);

      await this.page.mouse.click(x, y, { button });

      logger.info('Remote click executed successfully');
    } catch (error: any) {
      logger.error('Error performing remote click:', error.message);
      websocketClient.sendErrorReport('Remote click error', error.stack);
    }
  }

  public async remoteType(text: string, selector?: string): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot perform remote type: page not initialized');
      return;
    }

    try {
      logger.info(`Remote type: "${text.substring(0, 20)}${text.length > 20 ? '...' : ''}"${selector ? ` in selector: ${selector}` : ''}`);

      if (selector) {
        // Focus on the element first
        await this.page.waitForSelector(selector, { timeout: 5000 });
        await this.page.focus(selector);
        await this.page.keyboard.type(text);
      } else {
        // Check if there's an active element, if not try to find the first input/textarea
        const hasActiveInput = await this.page.evaluate(() => {
          // @ts-ignore - Code runs in browser context
          const active = document.activeElement;
          return active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.hasAttribute('contenteditable'));
        });

        if (!hasActiveInput) {
          // Try to focus the first available input/textarea
          const focused = await this.page.evaluate(() => {
            // @ts-ignore - Code runs in browser context
            const input = document.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), textarea, [contenteditable="true"]');
            if (input) {
              // @ts-ignore
              (input as HTMLElement).focus();
              return true;
            }
            return false;
          });

          if (!focused) {
            logger.warn('No text input found or focused. Click on a text box first.');
            websocketClient.sendErrorReport('Remote type failed', 'No text input focused. User should click on a text box first.');
            return;
          }
        }

        // Type at current focus
        await this.page.keyboard.type(text);
      }

      logger.info('Remote type executed successfully');
    } catch (error: any) {
      logger.error('Error performing remote type:', error.message);
      websocketClient.sendErrorReport('Remote type error', error.stack);
    }
  }

  public async remoteKey(key: string, modifiers?: ('Shift' | 'Control' | 'Alt' | 'Meta')[]): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot perform remote key: page not initialized');
      return;
    }

    try {
      logger.info(`Remote key: ${key}${modifiers ? ` with modifiers: ${modifiers.join('+')}` : ''}`);

      // Press modifiers
      if (modifiers) {
        for (const mod of modifiers) {
          await this.page.keyboard.down(mod);
        }
      }

      // Log focused element for debugging
      const focusedElement = await this.page.evaluate(() => {
        // @ts-ignore - Code runs in browser context
        const el = document.activeElement;
        return el ? { tagName: el.tagName, id: el.id, className: el.className, type: (el as any).type } : null;
      });
      logger.info(`Key '${key}' sent to focused element: ${JSON.stringify(focusedElement)}`);

      // Press the main key as any to bypass type checking
      await this.page.keyboard.press(key as any);

      // Release modifiers
      if (modifiers) {
        for (const mod of modifiers.reverse()) {
          await this.page.keyboard.up(mod);
        }
      }

      logger.info('Remote key executed successfully');
    } catch (error: any) {
      logger.error('Error performing remote key:', error.message);
      websocketClient.sendErrorReport('Remote key error', error.stack);
    }
  }

  public async remoteScroll(x?: number, y?: number, deltaX?: number, deltaY?: number): Promise<void> {
    if (!this.page) {
      logger.warn('Cannot perform remote scroll: page not initialized');
      return;
    }

    try {
      logger.info(`Remote scroll: x=${x}, y=${y}, deltaX=${deltaX}, deltaY=${deltaY}`);

      if (x !== undefined || y !== undefined) {
        // Absolute scroll
        await this.page.evaluate(`window.scrollTo(${x ?? 'window.scrollX'}, ${y ?? 'window.scrollY'})`);
      } else if (deltaX !== undefined || deltaY !== undefined) {
        // Relative scroll
        await this.page.evaluate(`window.scrollBy(${deltaX ?? 0}, ${deltaY ?? 0})`);
      }

      logger.info('Remote scroll executed successfully');
    } catch (error: any) {
      logger.error('Error performing remote scroll:', error.message);
      websocketClient.sendErrorReport('Remote scroll error', error.stack);
    }
  }
}

export const displayController = new DisplayController();
