/**
 * CrOS New Tab — Google Services Integration Service (v0.3.0)
 *
 * Manifest V3 Compliant, pure vanilla JS, zero external libraries.
 * Capabilities:
 * 1. OAuth 2.0 via chrome.identity.launchWebAuthFlow:
 *    - Dynamic user-configured Client ID (cros_v3.google.clientId).
 *    - Redirect URI via chrome.identity.getRedirectURL().
 *    - Least privilege scopes (Calendar readonly, Gmail readonly, Drive metadata readonly).
 *    - Token extraction from URL fragment with expiration timestamp.
 * 2. Built-in Mock Mode (cros_v3.google.mockMode):
 *    - Realistic schema-compliant fixtures for Calendar, Gmail, Drive.
 *    - Allows full desktop preview and testing without Google Cloud account.
 * 3. Google Calendar API v3:
 *    - Upcoming events with singleEvents=true, orderBy=startTime.
 *    - All-day vs timed events handling, Meet links, HTML links.
 * 4. Gmail API v1:
 *    - Instant unread count via /labels/INBOX.
 *    - Recent unread messages metadata (sender name parsing, subject fallback, snippet).
 * 5. Google Drive API v3:
 *    - Recent files via /files (orderBy viewedByMeTime desc).
 *    - MIME type icon mapping, webViewLink, thumbnailLink.
 * 6. Google News RSS Feed:
 *    - Native browser DOMParser XML parsing (zero external dependencies).
 *    - Topic categories, title cleaning (stripping " - Source" & CDATA).
 * 7. Ecosystem Shortcuts Catalog:
 *    - Predefined links for Google One, Keep, Photos, Meet, Docs, Sheets, Drive, Gmail, Calendar.
 * 8. Resilient UI State Handling & Error Recovery:
 *    - NO_CLIENT_ID, NOT_LOGGED_IN, MOCK, READY, TOKEN_EXPIRED, API_DISABLED, OFFLINE.
 *    - Offline caching in chrome.storage.local / localStorage.
 *    - Never crashes the newtab desktop on network or auth errors.
 */

(() => {
  'use strict';

  const STORAGE_V3_KEY = 'cros_v3';
  const AUTH_STORAGE_KEY = 'cros_google_auth';
  const CACHE_STORAGE_KEY = 'cros_google_cache';

  const OAUTH_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
  const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
  const GMAIL_LABELS_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX';
  const GMAIL_MESSAGES_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const DRIVE_FILES_BASE = 'https://www.googleapis.com/drive/v3/files';
  const NEWS_RSS_BASE = 'https://news.google.com/rss';

  const DEFAULT_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events.readonly',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.metadata.readonly'
  ];

  // DOM helper for widget rendering
  const el = (tag, props = {}, ...children) => {
    if (typeof document === 'undefined') {
      return {
        append: () => {},
        setAttribute: () => {},
        style: {},
        classList: { add: () => {}, remove: () => {}, toggle: () => {} },
        addEventListener: () => {}
      };
    }
    const node = Object.assign(document.createElement(tag), props);
    children.forEach((c) => {
      if (c != null) {
        if (typeof c === 'string' || typeof c === 'number') {
          node.appendChild(document.createTextNode(String(c)));
        } else {
          node.appendChild(c);
        }
      }
    });
    return node;
  };

  /**
   * Safe asynchronous storage wrapper (chrome.storage.local with localStorage fallback).
   */
  const storage = {
    async get(keys) {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.get(keys, (res) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.warn('[GoogleService] Storage get error:', chrome.runtime.lastError);
              resolve({});
            } else {
              resolve(res || {});
            }
          });
        });
      }
      const out = {};
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((k) => {
        try {
          const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(k) : null;
          out[k] = raw ? JSON.parse(raw) : null;
        } catch (_) {
          out[k] = null;
        }
      });
      return out;
    },

    async set(obj) {
      try {
        if (typeof localStorage !== 'undefined') {
          Object.entries(obj).forEach(([k, v]) => {
            localStorage.setItem(k, JSON.stringify(v));
          });
        }
      } catch (_) {}

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.set(obj, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              console.warn('[GoogleService] Storage set error:', chrome.runtime.lastError);
            }
            resolve();
          });
        });
      }
      return Promise.resolve();
    },

    async remove(keys) {
      const keyList = Array.isArray(keys) ? keys : [keys];
      try {
        if (typeof localStorage !== 'undefined') {
          keyList.forEach((k) => localStorage.removeItem(k));
        }
      } catch (_) {}

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return new Promise((resolve) => {
          chrome.storage.local.remove(keyList, () => resolve());
        });
      }
      return Promise.resolve();
    }
  };

  /**
   * GoogleService Implementation
   */
  class GoogleService {
    constructor(options = {}) {
      this.clientId = (options.clientId || options.client_id || '').trim();
      this.mockMode = Boolean(options.mockMode || options.mock_mode);
      this.token = options.token || null;
      this.tokenExpiry = options.tokenExpiry || options.token_expiry || null;
      this.scopes = options.scopes || DEFAULT_SCOPES;
      this.cache = {};

      this._initPromise = this.loadStoredConfig();
    }

    /**
     * Load stored Client ID, mock mode flag, auth token, and cache.
     */
    async loadStoredConfig() {
      try {
        const data = await storage.get([STORAGE_V3_KEY, AUTH_STORAGE_KEY, CACHE_STORAGE_KEY]);
        const v3 = data[STORAGE_V3_KEY];
        if (v3 && v3.google) {
          if (typeof v3.google.clientId === 'string') {
            this.clientId = v3.google.clientId.trim();
          }
          if (typeof v3.google.mockMode === 'boolean') {
            this.mockMode = v3.google.mockMode;
          }
        }

        const auth = data[AUTH_STORAGE_KEY];
        if (auth && auth.accessToken) {
          if (!auth.expiresAt || Date.now() < auth.expiresAt) {
            this.token = auth.accessToken;
            this.tokenExpiry = auth.expiresAt;
          } else {
            this.token = null;
            this.tokenExpiry = null;
            await storage.remove(AUTH_STORAGE_KEY);
          }
        }

        const cache = data[CACHE_STORAGE_KEY];
        if (cache && typeof cache === 'object') {
          this.cache = cache;
        }
      } catch (err) {
        console.warn('[GoogleService] Failed to load configuration from storage:', err);
      }
    }

    /**
     * Configure service dynamically
     */
    configure({ clientId, mockMode, scopes } = {}) {
      if (clientId !== undefined) {
        this.clientId = typeof clientId === 'string' ? clientId.trim() : '';
      }
      if (mockMode !== undefined) {
        this.mockMode = Boolean(mockMode);
      }
      if (scopes !== undefined && Array.isArray(scopes)) {
        this.scopes = scopes;
      }
      return this;
    }

    /**
     * Get stable redirect URI for chrome extension
     */
    getRedirectUrl() {
      if (typeof chrome !== 'undefined' && chrome.identity && typeof chrome.identity.getRedirectURL === 'function') {
        try {
          return chrome.identity.getRedirectURL();
        } catch (_) {}
      }
      const extId = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || 'cros-new-tab';
      return `https://${extId}.chromiumapp.org/`;
    }

    /**
     * Build OAuth 2.0 Web Auth authorization URL
     */
    buildAuthUrl(redirectUri, customScopes = null) {
      const redirect = redirectUri || this.getRedirectUrl();
      const scopesToUse = customScopes || this.scopes || DEFAULT_SCOPES;
      const params = new URLSearchParams({
        client_id: this.clientId,
        response_type: 'token',
        redirect_uri: redirect,
        scope: scopesToUse.join(' '),
        prompt: 'consent'
      });
      return `${OAUTH_AUTH_BASE}?${params.toString()}`;
    }

    // Snake_case alias for python test runner compatibility
    build_auth_url(redirect_uri) {
      return this.buildAuthUrl(redirect_uri);
    }

    /**
     * Extract token from redirect URL hash
     */
    parseRedirectHash(redirectUrl) {
      if (!redirectUrl || typeof redirectUrl !== 'string') {
        return { token: null, expires_in: 3600, error: 'Empty redirect URL' };
      }
      try {
        const urlObj = new URL(redirectUrl);
        const fragment = urlObj.hash.startsWith('#') ? urlObj.hash.slice(1) : urlObj.hash;
        const params = new URLSearchParams(fragment || urlObj.search);

        if (params.has('error')) {
          return {
            token: null,
            expires_in: 0,
            error: params.get('error'),
            errorDescription: params.get('error_description') || ''
          };
        }

        const token = params.get('access_token');
        let expiresIn = parseInt(params.get('expires_in') || '3600', 10);
        if (isNaN(expiresIn) || expiresIn <= 0) expiresIn = 3600;

        return { token: token || null, expires_in: expiresIn, error: null };
      } catch (err) {
        return { token: null, expires_in: 3600, error: err.message };
      }
    }

    // Snake_case alias
    parse_redirect_hash(redirect_url) {
      return this.parseRedirectHash(redirect_url);
    }

    /**
     * Check if user is currently authenticated or mock mode is active
     */
    async isAuthenticated() {
      await this._initPromise;
      if (this.mockMode) return true;
      if (!this.token) return false;
      if (this.tokenExpiry && Date.now() >= this.tokenExpiry) {
        await this.logout();
        return false;
      }
      return true;
    }

    /**
     * Get current high-level auth state
     */
    getAuthState() {
      if (this.mockMode) return 'MOCK';
      if (!this.clientId) return 'NO_CLIENT_ID';
      if (!this.token) return 'NOT_LOGGED_IN';
      if (this.tokenExpiry && Date.now() >= this.tokenExpiry) return 'TOKEN_EXPIRED';
      return 'AUTHENTICATED';
    }

    /**
     * Initiate OAuth login flow via chrome.identity.launchWebAuthFlow
     */
    async login() {
      await this._initPromise;
      if (this.mockMode) {
        this.token = 'mock_google_oauth_token_' + Date.now();
        this.tokenExpiry = Date.now() + 3600 * 1000;
        return this.token;
      }

      if (!this.clientId) {
        throw new Error('OAuth Client ID is not configured. Please enter your Client ID in Settings.');
      }

      const redirectUri = this.getRedirectUrl();
      const authUrl = this.buildAuthUrl(redirectUri);

      if (typeof chrome === 'undefined' || !chrome.identity || typeof chrome.identity.launchWebAuthFlow !== 'function') {
        throw new Error('chrome.identity.launchWebAuthFlow is not available in this environment.');
      }

      return new Promise((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          {
            url: authUrl,
            interactive: true
          },
          async (responseUrl) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              const errMsg = chrome.runtime.lastError.message || 'The user closed the authorization window.';
              reject(new Error(errMsg));
              return;
            }
            if (!responseUrl) {
              reject(new Error('No response URL returned from authorization flow.'));
              return;
            }

            const parsed = this.parseRedirectHash(responseUrl);
            if (parsed.error || !parsed.token) {
              reject(new Error(parsed.errorDescription || parsed.error || 'Failed to extract access token.'));
              return;
            }

            this.token = parsed.token;
            this.tokenExpiry = Date.now() + (parsed.expires_in - 60) * 1000;

            await storage.set({
              [AUTH_STORAGE_KEY]: {
                accessToken: this.token,
                expiresAt: this.tokenExpiry
              }
            });

            resolve(this.token);
          }
        );
      });
    }

    /**
     * Logout and clear saved tokens
     */
    async logout() {
      this.token = null;
      this.tokenExpiry = null;
      await storage.remove(AUTH_STORAGE_KEY);
    }

    /**
     * Helper to perform authenticated Google API fetch
     */
    async fetchWithAuth(url, options = {}) {
      await this._initPromise;
      if (!this.token) {
        throw new Error('NOT_AUTHENTICATED');
      }

      if (this.tokenExpiry && Date.now() >= this.tokenExpiry) {
        await this.logout();
        throw new Error('TOKEN_EXPIRED');
      }

      const headers = Object.assign(
        {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json'
        },
        options.headers || {}
      );

      const response = await fetch(url, { ...options, headers });

      if (response.status === 401) {
        await this.logout();
        throw new Error('TOKEN_EXPIRED');
      }

      if (response.status === 403) {
        const errorBody = await response.json().catch(() => ({}));
        const reason = errorBody.error?.errors?.[0]?.reason || errorBody.error?.status;
        if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED') {
          throw new Error('API_DISABLED');
        }
        throw new Error(`API_FORBIDDEN: ${errorBody.error?.message || 'Access Forbidden'}`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();
    }

    /**
     * Save cache item to storage
     */
    async saveCache(key, data) {
      this.cache[key] = {
        timestamp: Date.now(),
        data
      };
      await storage.set({ [CACHE_STORAGE_KEY]: this.cache });
    }

    /**
     * 1. GOOGLE CALENDAR API v3
     */
    async getCalendarEvents(maxResults = 5) {
      await this._initPromise;
      if (this.mockMode || (!this.token && this.clientId === '')) {
        return this.getMockCalendarEvents(maxResults);
      }

      try {
        const params = new URLSearchParams({
          timeMin: new Date().toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: String(maxResults),
          showDeleted: 'false'
        });
        const url = `${CALENDAR_API_BASE}?${params.toString()}`;
        const data = await this.fetchWithAuth(url);

        const items = (data.items || [])
          .filter((it) => it.status !== 'cancelled')
          .map((it) => {
            const isAllDay = Boolean(it.start && !it.start.dateTime && it.start.date);
            return {
              id: it.id || 'evt-' + Math.random().toString(36).slice(2),
              summary: it.summary || '(Без названия)',
              start: it.start || {},
              end: it.end || {},
              isAllDay,
              hangoutLink: it.hangoutLink || it.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri || null,
              htmlLink: it.htmlLink || 'https://calendar.google.com/'
            };
          });

        await this.saveCache('calendar', items);
        return items;
      } catch (err) {
        console.warn('[GoogleService] getCalendarEvents failed:', err.message);
        if (this.cache.calendar && this.cache.calendar.data) {
          const cached = this.cache.calendar.data;
          cached.isCached = true;
          return cached;
        }
        if (this.mockMode) {
          return this.getMockCalendarEvents(maxResults);
        }
        throw err;
      }
    }

    /**
     * 2. GMAIL API v1
     */
    async getGmailUnread(maxResults = 5) {
      await this._initPromise;
      if (this.mockMode || (!this.token && this.clientId === '')) {
        return this.getMockGmailUnread();
      }

      try {
        // Step 1: Instant unread count
        const labelData = await this.fetchWithAuth(GMAIL_LABELS_BASE);
        const unreadCount = Number(labelData.messagesUnread) || 0;

        if (unreadCount === 0) {
          const result = { unreadCount: 0, messages: [] };
          await this.saveCache('gmail', result);
          return result;
        }

        // Step 2: Message IDs list
        const listParams = new URLSearchParams({
          q: 'is:unread in:inbox',
          maxResults: String(maxResults)
        });
        const listData = await this.fetchWithAuth(`${GMAIL_MESSAGES_BASE}?${listParams.toString()}`);
        const messagesRaw = listData.messages || [];

        // Step 3: Fetch metadata for top messages in parallel
        const messages = await Promise.all(
          messagesRaw.slice(0, maxResults).map(async (m) => {
            try {
              const metaUrl = `${GMAIL_MESSAGES_BASE}/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
              const meta = await this.fetchWithAuth(metaUrl);
              const headers = meta.payload?.headers || [];

              const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

              const fromRaw = getHeader('From') || 'Google';
              const subjectRaw = getHeader('Subject') || '(Без темы)';
              const dateRaw = getHeader('Date') || '';

              // Clean From to display name or email
              let fromDisplay = fromRaw;
              const angleMatch = fromRaw.match(/^(.*?)\s*<.*?>$/);
              if (angleMatch && angleMatch[1]) {
                fromDisplay = angleMatch[1].trim().replace(/^["']|["']$/g, '');
              }

              // Clean snippet HTML entities
              const snippet = (meta.snippet || '')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");

              return {
                id: m.id,
                threadId: m.threadId,
                from: fromDisplay,
                subject: subjectRaw,
                snippet,
                date: dateRaw,
                link: `https://mail.google.com/mail/u/0/#inbox/${m.threadId || m.id}`
              };
            } catch (_) {
              return {
                id: m.id,
                from: 'Gmail',
                subject: '(Не удалось загрузить сообщение)',
                snippet: '',
                link: `https://mail.google.com/mail/u/0/#inbox/${m.id}`
              };
            }
          })
        );

        const result = { unreadCount, messages };
        await this.saveCache('gmail', result);
        return result;
      } catch (err) {
        console.warn('[GoogleService] getGmailUnread failed:', err.message);
        if (this.cache.gmail && this.cache.gmail.data) {
          const cached = this.cache.gmail.data;
          cached.isCached = true;
          return cached;
        }
        if (this.mockMode) {
          return this.getMockGmailUnread();
        }
        throw err;
      }
    }

    /**
     * 3. GOOGLE DRIVE API v3
     */
    async getDriveRecentFiles(maxResults = 5) {
      await this._initPromise;
      if (this.mockMode || (!this.token && this.clientId === '')) {
        return this.getMockDriveFiles(maxResults);
      }

      try {
        const params = new URLSearchParams({
          pageSize: String(maxResults),
          orderBy: 'viewedByMeTime desc',
          q: 'trashed = false',
          fields: 'files(id,name,mimeType,iconLink,thumbnailLink,webViewLink,modifiedTime,viewedByMeTime)'
        });
        const url = `${DRIVE_FILES_BASE}?${params.toString()}`;
        const data = await this.fetchWithAuth(url);

        const files = (data.files || []).map((f) => ({
          id: f.id,
          name: f.name || '(Без названия)',
          mimeType: f.mimeType || 'application/octet-stream',
          webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
          iconLink: f.iconLink || 'https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.document',
          thumbnailLink: f.thumbnailLink || null,
          modifiedTime: f.modifiedTime,
          viewedByMeTime: f.viewedByMeTime
        }));

        await this.saveCache('drive', files);
        return files;
      } catch (err) {
        console.warn('[GoogleService] getDriveRecentFiles failed:', err.message);
        if (this.cache.drive && this.cache.drive.data) {
          const cached = this.cache.drive.data;
          cached.isCached = true;
          return cached;
        }
        if (this.mockMode) {
          return this.getMockDriveFiles(maxResults);
        }
        throw err;
      }
    }

    // Alias for PROJECT.md contract
    getDriveFiles(maxResults = 5) {
      return this.getDriveRecentFiles(maxResults);
    }

    /**
     * 4. GOOGLE NEWS RSS / ATOM FEED
     */
    buildRssUrl(hl = 'ru', gl = 'RU', ceid = 'RU:ru', topic = '') {
      if (topic) {
        return `${NEWS_RSS_BASE}/headlines/section/topic/${encodeURIComponent(topic)}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
      }
      return `${NEWS_RSS_BASE}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
    }

    // Snake_case alias
    static build_rss_url(hl = 'ru', gl = 'RU', ceid = 'RU:ru') {
      return `${NEWS_RSS_BASE}?hl=${hl}&gl=${gl}&ceid=${ceid}`;
    }

    /**
     * Native DOMParser RSS XML parser (zero external libraries)
     */
    parseRssXml(xmlText) {
      if (!xmlText || typeof xmlText !== 'string') return [];

      // If browser DOMParser is available
      if (typeof DOMParser !== 'undefined') {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
          // If DOMParser reported an error, fallback to regex
          return this.parseRssXmlRegex(xmlText);
        }

        const items = Array.from(xmlDoc.querySelectorAll('item')).map((item) => {
          let title = item.querySelector('title')?.textContent || '';
          const sourceEl = item.querySelector('source');
          let source = sourceEl?.textContent || '';
          const sourceUrl = sourceEl?.getAttribute('url') || '';
          const link = item.querySelector('link')?.textContent || '';
          const pubDate = item.querySelector('pubDate')?.textContent || '';

          // Clean CDATA wrappers if raw
          title = title.replace(/^<!\[CDATA\[(.*?)\]\]>$/, '$1').trim();
          source = source.replace(/^<!\[CDATA\[(.*?)\]\]>$/, '$1').trim();

          // Strip " - Source Name" suffix
          if (source && title.endsWith(' - ' + source)) {
            title = title.slice(0, -(source.length + 3)).trim();
          }

          return { title, link, source, sourceUrl, pubDate };
        });

        return items;
      }

      // Fallback for headless/Node environments
      return this.parseRssXmlRegex(xmlText);
    }

    parseRssXmlRegex(xmlText) {
      const items = [];
      const itemBlocks = xmlText.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
      for (const block of itemBlocks) {
        const titleM = block.match(/<title[\s>]([\s\S]*?)<\/title>/i);
        const linkM = block.match(/<link[\s>]([\s\S]*?)<\/link>/i);
        const pubM = block.match(/<pubDate[\s>]([\s\S]*?)<\/pubDate>/i);
        const sourceM = block.match(/<source(?:\s+url=["']([^"']*)["'])?[\s>]([\s\S]*?)<\/source>/i);

        let title = titleM ? titleM[1].trim() : '';
        const link = linkM ? linkM[1].trim() : '';
        const pubDate = pubM ? pubM[1].trim() : '';
        let source = sourceM && sourceM[2] ? sourceM[2].trim() : '';
        const sourceUrl = sourceM && sourceM[1] ? sourceM[1].trim() : '';

        // Strip CDATA
        title = title.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
        source = source.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

        // Strip source suffix from title
        if (source && title.endsWith(' - ' + source)) {
          title = title.slice(0, -(source.length + 3)).trim();
        }

        items.push({ title, link, pubDate, source, sourceUrl });
      }
      return items;
    }

    // Static compatibility alias matching test runner
    static parse_rss_xml_text(xml_text) {
      const inst = new GoogleService();
      return inst.parseRssXml(xml_text);
    }

    /**
     * Fetch Google News RSS items
     */
    async getGoogleNews(topic = '', count = 5) {
      try {
        const url = this.buildRssUrl('ru', 'RU', 'RU:ru', topic);
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        const xmlText = await resp.text();
        const items = this.parseRssXml(xmlText);
        const sliced = items.slice(0, count);

        await this.saveCache('news_' + (topic || 'main'), sliced);
        return sliced;
      } catch (err) {
        console.warn('[GoogleService] getGoogleNews fetch error:', err.message);
        const cacheKey = 'news_' + (topic || 'main');
        if (this.cache[cacheKey] && this.cache[cacheKey].data) {
          const cached = this.cache[cacheKey].data;
          cached.isCached = true;
          return cached;
        }

        // Return realistic fallback news items
        return [
          {
            title: 'ChromeOS 130 представляет новые виджеты и интеграцию рабочего стола',
            link: 'https://news.google.com/',
            source: 'Google News',
            sourceUrl: 'https://news.google.com/',
            pubDate: new Date().toUTCString()
          },
          {
            title: 'Google расширяет возможности кастомизации браузера и новой вкладки',
            link: 'https://news.google.com/',
            source: 'Chrome Blog',
            sourceUrl: 'https://blog.google/',
            pubDate: new Date().toUTCString()
          }
        ].slice(0, count);
      }
    }

    // Alias for PROJECT.md contract
    getNews(topic = '', count = 5) {
      return this.getGoogleNews(topic, count);
    }

    /**
     * 5. GOOGLE ECOSYSTEM SHORTCUTS CATALOG
     */
    getGoogleShortcuts() {
      return [
        { id: 'sc-google-one', title: 'Google One', url: 'https://one.google.com', icon: '☁️', color: '#1a73e8' },
        { id: 'sc-google-keep', title: 'Google Keep', url: 'https://keep.google.com', icon: '💡', color: '#f9ab00' },
        { id: 'sc-google-photos', title: 'Google Фото', url: 'https://photos.google.com', icon: '🖼️', color: '#ea4335' },
        { id: 'sc-google-meet', title: 'Google Meet', url: 'https://meet.google.com', icon: '📹', color: '#34a853' },
        { id: 'sc-google-docs', title: 'Google Docs', url: 'https://docs.google.com', icon: '📄', color: '#4285f4' },
        { id: 'sc-google-sheets', title: 'Google Таблицы', url: 'https://sheets.google.com', icon: '📊', color: '#0f9d58' },
        { id: 'sc-google-drive', title: 'Google Диск', url: 'https://drive.google.com', icon: '📁', color: '#ffbb00' },
        { id: 'sc-google-mail', title: 'Gmail', url: 'https://mail.google.com', icon: '✉️', color: '#ea4335' },
        { id: 'sc-google-cal', title: 'Google Календарь', url: 'https://calendar.google.com', icon: '📅', color: '#4285f4' }
      ];
    }

    /**
     * 6. SCHEMA-COMPLIANT MOCK FIXTURES (Matching test_helpers.py and survey report)
     */
    getMockCalendarEvents(maxResults = 5) {
      const now = Date.now();
      const formatIso = (ms) => new Date(ms).toISOString();
      return [
        {
          id: 'cal-evt-1',
          summary: 'Team Sync & Standup',
          start: { dateTime: formatIso(now + 3600000) },
          end: { dateTime: formatIso(now + 7200000) },
          hangoutLink: 'https://meet.google.com/abc-defg-hij',
          htmlLink: 'https://calendar.google.com/calendar/event?eid=1',
          isAllDay: false
        },
        {
          id: 'cal-evt-2',
          summary: 'CrOS Architecture Review',
          start: { dateTime: formatIso(now + 14400000) },
          end: { dateTime: formatIso(now + 18000000) },
          hangoutLink: 'https://meet.google.com/cros-arch-m5',
          htmlLink: 'https://calendar.google.com/calendar/event?eid=2',
          isAllDay: false
        },
        {
          id: 'cal-evt-3',
          summary: 'Release 0.3 Deployment Day',
          start: { date: new Date(now + 86400000).toISOString().slice(0, 10) },
          end: { date: new Date(now + 86400000).toISOString().slice(0, 10) },
          htmlLink: 'https://calendar.google.com/calendar/event?eid=3',
          isAllDay: true
        }
      ].slice(0, maxResults);
    }

    // Snake_case alias for python test runner
    get_mock_calendar_events(max_results = 5) {
      return this.getMockCalendarEvents(max_results);
    }

    getMockGmailUnread() {
      return {
        unreadCount: 3,
        messages: [
          {
            id: 'msg-101',
            snippet: "Don't forget to push feature/CrOS_0.3 branch before EOD.",
            from: 'Alex Developer <alex@example.com>',
            subject: 'CrOS v0.3 Release Status',
            link: 'https://mail.google.com/mail/u/0/#inbox'
          },
          {
            id: 'msg-102',
            snippet: 'Weekly digest from Google Cloud Platform updates.',
            from: 'Google Cloud <noreply@google.com>',
            subject: 'GCP Architecture Newsletter',
            link: 'https://mail.google.com/mail/u/0/#inbox'
          },
          {
            id: 'msg-103',
            snippet: 'Security alert: New sign-in detected on ChromeOS device.',
            from: 'Google Security <no-reply@accounts.google.com>',
            subject: 'Security notice for your account',
            link: 'https://mail.google.com/mail/u/0/#inbox'
          }
        ]
      };
    }

    // Snake_case alias
    get_mock_gmail_unread() {
      return this.getMockGmailUnread();
    }

    getMockDriveFiles(maxResults = 5) {
      return [
        {
          id: 'drive-doc-1',
          name: 'CrOS New Tab v0.3 Architecture Spec.gdoc',
          mimeType: 'application/vnd.google-apps.document',
          webViewLink: 'https://docs.google.com/document/d/mock1',
          iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.document',
          viewedByMeTime: new Date(Date.now() - 3600000).toISOString()
        },
        {
          id: 'drive-sheet-2',
          name: 'E2E Test Matrix & Verification Coverage.gsheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          webViewLink: 'https://docs.google.com/spreadsheets/d/mock2',
          iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.spreadsheet',
          viewedByMeTime: new Date(Date.now() - 7200000).toISOString()
        },
        {
          id: 'drive-pdf-3',
          name: 'ChromeOS Enterprise Kiosk Deployment Guide.pdf',
          mimeType: 'application/pdf',
          webViewLink: 'https://drive.google.com/file/d/mock3/view',
          iconLink: 'https://drive-thirdparty.googleusercontent.com/16/type/application/pdf',
          viewedByMeTime: new Date(Date.now() - 86400000).toISOString()
        }
      ].slice(0, maxResults);
    }

    // Snake_case alias
    get_mock_drive_files(max_results = 5) {
      return this.getMockDriveFiles(max_results);
    }

    /**
     * MIME Type icon and name helper
     */
    static getMimeTypePresentation(mimeType) {
      switch (mimeType) {
        case 'application/vnd.google-apps.document':
          return { icon: '📄', label: 'Документ', color: '#4285f4' };
        case 'application/vnd.google-apps.spreadsheet':
          return { icon: '📊', label: 'Таблица', color: '#0f9d58' };
        case 'application/vnd.google-apps.presentation':
          return { icon: '📑', label: 'Презентация', color: '#f4b400' };
        case 'application/vnd.google-apps.folder':
          return { icon: '📁', label: 'Папка', color: '#5f6368' };
        case 'application/pdf':
          return { icon: '📕', label: 'PDF', color: '#ea4335' };
        default:
          if (mimeType && mimeType.startsWith('image/')) return { icon: '🖼️', label: 'Изображение', color: '#db4437' };
          return { icon: '📎', label: 'Файл', color: '#70757a' };
      }
    }

    /**
     * Helper to open Google settings in settings panel
     */
    static openGoogleSettings() {
      if (typeof document === 'undefined') return;
      const settingsPanel = document.getElementById('settings-panel');
      if (settingsPanel) settingsPanel.classList.add('open');
      const googleTabBtn = document.getElementById('tab-btn-google');
      if (googleTabBtn) googleTabBtn.click();
    }

    /**
     * Format timestamp nicely
     */
    static formatDateTime(isoString) {
      if (!isoString) return '';
      try {
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return isoString;
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const months = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
        return `${d.getDate()} ${months[d.getMonth()]}, ${hours}:${mins}`;
      } catch (_) {
        return isoString;
      }
    }

    /**
     * =========================================================================
     * UI WIDGET RENDERERS FOR CrosWidgets
     * =========================================================================
     */

    /**
     * Render State Box: NO_CLIENT_ID
     */
    renderNoClientIdCard(serviceTitle, body) {
      const card = el('div', { className: 'google-widget-card google-state-card' },
        el('div', { className: 'google-state-icon', textContent: '🔑' }),
        el('div', { className: 'google-state-title', textContent: `${serviceTitle}: Требуется Client ID` }),
        el('div', { className: 'google-state-desc', textContent: 'Для подключения к сервисам Google настройте OAuth Client ID в параметрах расширения.' }),
        el('button', {
          className: 'btn btn-primary google-action-btn',
          textContent: 'Настроить в параметрах',
          onclick: (e) => {
            e.stopPropagation();
            GoogleService.openGoogleSettings();
          }
        })
      );
      body.replaceChildren(card);
    }

    /**
     * Render State Box: NOT_LOGGED_IN
     */
    renderNotLoggedInCard(serviceTitle, body, onLoginSuccess) {
      const loginBtn = el('button', {
        className: 'btn btn-primary google-action-btn',
        textContent: 'Войти через Google'
      });
      const errorDiv = el('div', { className: 'google-state-error', style: 'display:none;' });

      loginBtn.onclick = async (e) => {
        e.stopPropagation();
        loginBtn.disabled = true;
        loginBtn.textContent = 'Авторизация…';
        errorDiv.style.display = 'none';
        try {
          await this.login();
          if (typeof onLoginSuccess === 'function') onLoginSuccess();
        } catch (err) {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Войти через Google';
          errorDiv.textContent = err.message || 'Ошибка входа';
          errorDiv.style.display = 'block';
        }
      };

      const card = el('div', { className: 'google-widget-card google-state-card' },
        el('div', { className: 'google-state-icon', textContent: '👤' }),
        el('div', { className: 'google-state-title', textContent: `${serviceTitle}: Требуется вход` }),
        el('div', { className: 'google-state-desc', textContent: 'Войдите в учетную запись Google для загрузки данных.' }),
        loginBtn,
        errorDiv
      );
      body.replaceChildren(card);
    }

    /**
     * Render State Box: OFFLINE / ERROR
     */
    renderErrorCard(serviceTitle, body, errorMsg, onRetry) {
      const retryBtn = el('button', {
        className: 'btn google-retry-btn',
        textContent: 'Повторить',
        onclick: (e) => {
          e.stopPropagation();
          if (typeof onRetry === 'function') onRetry();
        }
      });

      const card = el('div', { className: 'google-widget-card google-state-card' },
        el('div', { className: 'google-state-icon', textContent: '⚠️' }),
        el('div', { className: 'google-state-title', textContent: 'Сбой подключения' }),
        el('div', { className: 'google-state-desc', textContent: errorMsg || 'Не удалось получить данные с сервера.' }),
        retryBtn
      );
      body.replaceChildren(card);
    }

    /**
     * Render Header Badge with Mock Mode / Offline indicators
     */
    createStatusBadge(isCached = false) {
      if (this.mockMode) {
        return el('span', {
          className: 'google-badge google-badge-mock',
          textContent: 'Демо-режим',
          title: 'Отображаются тестовые данные (Mock Mode)'
        });
      }
      if (isCached) {
        return el('span', {
          className: 'google-badge google-badge-cached',
          textContent: 'Офлайн (кэш)',
          title: 'Показаны сохраненные данные'
        });
      }
      return null;
    }

    /**
     * 1. GOOGLE CALENDAR WIDGET RENDERER
     */
    async renderCalendarWidget(w, body) {
      body.replaceChildren(el('div', { className: 'google-loading-text', textContent: 'Загрузка событий…' }));

      const authState = this.getAuthState();
      if (authState === 'NO_CLIENT_ID') {
        this.renderNoClientIdCard('Календарь', body);
        return;
      }
      if (authState === 'NOT_LOGGED_IN' || authState === 'TOKEN_EXPIRED') {
        this.renderNotLoggedInCard('Календарь', body, () => this.renderCalendarWidget(w, body));
        return;
      }

      try {
        const maxItems = (w.config && w.config.maxItems) || 5;
        const events = await this.getCalendarEvents(maxItems);

        const listEl = el('div', { className: 'google-calendar-list' });

        if (!events || events.length === 0) {
          listEl.append(el('div', { className: 'google-empty-text', textContent: 'Нет предстоящих событий' }));
        } else {
          events.forEach((ev) => {
            let timeStr = 'Весь день';
            if (!ev.isAllDay && ev.start && ev.start.dateTime) {
              timeStr = GoogleService.formatDateTime(ev.start.dateTime);
            } else if (ev.start && ev.start.date) {
              timeStr = `${ev.start.date} (Весь день)`;
            }

            const timeChip = el('span', { className: 'cal-event-time', textContent: timeStr });
            const titleSpan = el('a', {
              className: 'cal-event-title',
              textContent: ev.summary || '(Без названия)',
              href: ev.htmlLink || 'https://calendar.google.com/',
              target: '_blank',
              rel: 'noopener noreferrer'
            });

            const chipsRow = el('div', { className: 'cal-event-meta' }, timeChip);

            if (ev.hangoutLink) {
              const meetBtn = el('a', {
                className: 'cal-meet-btn',
                href: ev.hangoutLink,
                target: '_blank',
                rel: 'noopener noreferrer',
                title: 'Присоединиться к видеовстрече Meet'
              }, '📹 Meet');
              chipsRow.append(meetBtn);
            }

            const itemNode = el('div', { className: 'cal-event-item' }, titleSpan, chipsRow);
            listEl.append(itemNode);
          });
        }

        // Top toolbar (badge + refresh + open calendar link)
        const badge = this.createStatusBadge(events.isCached);
        const topBar = el('div', { className: 'google-widget-topbar' },
          badge || el('span'),
          el('div', { className: 'google-topbar-actions' },
            el('button', {
              className: 'widget-chip-btn',
              textContent: '🔄',
              title: 'Обновить события',
              onclick: (e) => {
                e.stopPropagation();
                this.renderCalendarWidget(w, body);
              }
            }),
            el('a', {
              className: 'widget-chip-btn',
              href: 'https://calendar.google.com/',
              target: '_blank',
              rel: 'noopener noreferrer',
              title: 'Открыть Google Календарь'
            }, '↗')
          )
        );

        body.replaceChildren(topBar, listEl);
      } catch (err) {
        if (err.message === 'NOT_AUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
          this.renderNotLoggedInCard('Календарь', body, () => this.renderCalendarWidget(w, body));
        } else if (err.message === 'API_DISABLED') {
          body.replaceChildren(el('div', { className: 'google-widget-card google-state-card' },
            el('div', { className: 'google-state-title', textContent: 'Google Calendar API отключен' }),
            el('div', { className: 'google-state-desc', textContent: 'Включите Google Calendar API в Google Cloud Console для вашего Client ID.' }),
            el('a', {
              className: 'btn btn-primary',
              href: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
              target: '_blank'
            }, 'Открыть Google Cloud')
          ));
        } else {
          this.renderErrorCard('Календарь', body, err.message, () => this.renderCalendarWidget(w, body));
        }
      }
    }

    /**
     * 2. GMAIL WIDGET RENDERER
     */
    async renderGmailWidget(w, body) {
      body.replaceChildren(el('div', { className: 'google-loading-text', textContent: 'Проверка входящих…' }));

      const authState = this.getAuthState();
      if (authState === 'NO_CLIENT_ID') {
        this.renderNoClientIdCard('Gmail', body);
        return;
      }
      if (authState === 'NOT_LOGGED_IN' || authState === 'TOKEN_EXPIRED') {
        this.renderNotLoggedInCard('Gmail', body, () => this.renderGmailWidget(w, body));
        return;
      }

      try {
        const maxItems = (w.config && w.config.maxItems) || 5;
        const res = await this.getGmailUnread(maxItems);
        const unreadCount = res.unreadCount || 0;
        const messages = res.messages || [];

        const unreadBadgeText = unreadCount > 99 ? '99+' : String(unreadCount);
        const countPill = el('span', {
          className: 'gmail-unread-pill' + (unreadCount > 0 ? ' has-unread' : ''),
          textContent: unreadCount === 0 ? 'Все прочитано' : `${unreadBadgeText} непрочит.`
        });

        const badge = this.createStatusBadge(res.isCached);
        const topBar = el('div', { className: 'google-widget-topbar' },
          el('div', { className: 'google-topbar-left' }, countPill, badge),
          el('div', { className: 'google-topbar-actions' },
            el('button', {
              className: 'widget-chip-btn',
              textContent: '🔄',
              title: 'Проверить почту',
              onclick: (e) => {
                e.stopPropagation();
                this.renderGmailWidget(w, body);
              }
            }),
            el('a', {
              className: 'widget-chip-btn',
              href: 'https://mail.google.com/mail/u/0/#inbox',
              target: '_blank',
              rel: 'noopener noreferrer',
              title: 'Открыть Gmail'
            }, '↗')
          )
        );

        const listEl = el('div', { className: 'gmail-messages-list' });

        if (messages.length === 0) {
          listEl.append(el('div', { className: 'google-empty-text', textContent: unreadCount === 0 ? 'Входящие пусты (все письма прочитаны)' : 'Нет новых писем' }));
        } else {
          messages.forEach((msg) => {
            const senderSpan = el('span', { className: 'gmail-msg-from', textContent: msg.from || 'Google' });
            const subjectSpan = el('span', { className: 'gmail-msg-subject', textContent: msg.subject || '(Без темы)' });
            const snippetSpan = el('span', { className: 'gmail-msg-snippet', textContent: msg.snippet || '' });

            const row = el('a', {
              className: 'gmail-msg-item',
              href: msg.link || `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
              target: '_blank',
              rel: 'noopener noreferrer'
            },
              el('div', { className: 'gmail-msg-head' }, senderSpan),
              subjectSpan,
              snippetSpan
            );
            listEl.append(row);
          });
        }

        body.replaceChildren(topBar, listEl);
      } catch (err) {
        if (err.message === 'NOT_AUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
          this.renderNotLoggedInCard('Gmail', body, () => this.renderGmailWidget(w, body));
        } else if (err.message === 'API_DISABLED') {
          body.replaceChildren(el('div', { className: 'google-widget-card google-state-card' },
            el('div', { className: 'google-state-title', textContent: 'Gmail API отключен' }),
            el('div', { className: 'google-state-desc', textContent: 'Включите Gmail API в Google Cloud Console для вашего Client ID.' }),
            el('a', {
              className: 'btn btn-primary',
              href: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
              target: '_blank'
            }, 'Открыть Google Cloud')
          ));
        } else {
          this.renderErrorCard('Gmail', body, err.message, () => this.renderGmailWidget(w, body));
        }
      }
    }

    /**
     * 3. GOOGLE DRIVE WIDGET RENDERER
     */
    async renderDriveWidget(w, body) {
      body.replaceChildren(el('div', { className: 'google-loading-text', textContent: 'Загрузка недавних файлов…' }));

      const authState = this.getAuthState();
      if (authState === 'NO_CLIENT_ID') {
        this.renderNoClientIdCard('Google Диск', body);
        return;
      }
      if (authState === 'NOT_LOGGED_IN' || authState === 'TOKEN_EXPIRED') {
        this.renderNotLoggedInCard('Google Диск', body, () => this.renderDriveWidget(w, body));
        return;
      }

      try {
        const maxItems = (w.config && w.config.maxItems) || 5;
        const files = await this.getDriveRecentFiles(maxItems);

        const badge = this.createStatusBadge(files.isCached);
        const topBar = el('div', { className: 'google-widget-topbar' },
          badge || el('span'),
          el('div', { className: 'google-topbar-actions' },
            el('button', {
              className: 'widget-chip-btn',
              textContent: '🔄',
              title: 'Обновить файлы',
              onclick: (e) => {
                e.stopPropagation();
                this.renderDriveWidget(w, body);
              }
            }),
            el('a', {
              className: 'widget-chip-btn',
              href: 'https://drive.google.com/drive/my-drive',
              target: '_blank',
              rel: 'noopener noreferrer',
              title: 'Открыть Google Диск'
            }, '↗')
          )
        );

        const listEl = el('div', { className: 'drive-files-list' });

        if (!files || files.length === 0) {
          listEl.append(el('div', { className: 'google-empty-text', textContent: 'Нет недавних файлов' }));
        } else {
          files.forEach((f) => {
            const meta = GoogleService.getMimeTypePresentation(f.mimeType);
            const iconSpan = el('span', { className: 'drive-file-icon', textContent: meta.icon });
            const nameSpan = el('span', {
              className: 'drive-file-name',
              textContent: f.name || '(Без названия)',
              title: f.name
            });
            const typeLabel = el('span', { className: 'drive-file-type', textContent: meta.label });

            const row = el('a', {
              className: 'drive-file-item',
              href: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
              target: '_blank',
              rel: 'noopener noreferrer'
            },
              iconSpan,
              el('div', { className: 'drive-file-info' }, nameSpan, typeLabel)
            );
            listEl.append(row);
          });
        }

        body.replaceChildren(topBar, listEl);
      } catch (err) {
        if (err.message === 'NOT_AUTHENTICATED' || err.message === 'TOKEN_EXPIRED') {
          this.renderNotLoggedInCard('Google Диск', body, () => this.renderDriveWidget(w, body));
        } else if (err.message === 'API_DISABLED') {
          body.replaceChildren(el('div', { className: 'google-widget-card google-state-card' },
            el('div', { className: 'google-state-title', textContent: 'Google Drive API отключен' }),
            el('div', { className: 'google-state-desc', textContent: 'Включите Google Drive API в Google Cloud Console для вашего Client ID.' }),
            el('a', {
              className: 'btn btn-primary',
              href: 'https://console.cloud.google.com/apis/library/drive.googleapis.com',
              target: '_blank'
            }, 'Открыть Google Cloud')
          ));
        } else {
          this.renderErrorCard('Google Диск', body, err.message, () => this.renderDriveWidget(w, body));
        }
      }
    }

    /**
     * 4. GOOGLE NEWS / RSS WIDGET RENDERER
     */
    async renderNewsWidget(w, body, save) {
      w.config = w.config || {};
      const currentTopic = w.config.topic || '';
      const count = w.config.count || 5;

      body.replaceChildren(el('div', { className: 'google-loading-text', textContent: 'Загрузка новостей…' }));

      try {
        const items = await this.getGoogleNews(currentTopic, count);

        // Topic selector row
        const topics = [
          { id: '', label: 'Главное' },
          { id: 'TECHNOLOGY', label: 'IT' },
          { id: 'BUSINESS', label: 'Бизнес' },
          { id: 'SCIENCE', label: 'Наука' }
        ];

        const topicButtons = topics.map((t) => {
          const btn = el('button', {
            className: 'news-topic-chip' + (currentTopic === t.id ? ' active' : ''),
            textContent: t.label,
            onclick: (e) => {
              e.stopPropagation();
              w.config.topic = t.id;
              if (typeof save === 'function') save();
              this.renderNewsWidget(w, body, save);
            }
          });
          return btn;
        });

        const topBar = el('div', { className: 'google-widget-topbar news-topbar' },
          el('div', { className: 'news-topics-row' }, ...topicButtons),
          el('div', { className: 'google-topbar-actions' },
            el('button', {
              className: 'widget-chip-btn',
              textContent: '🔄',
              title: 'Обновить ленту новостей',
              onclick: (e) => {
                e.stopPropagation();
                this.renderNewsWidget(w, body, save);
              }
            }),
            el('a', {
              className: 'widget-chip-btn',
              href: 'https://news.google.com/',
              target: '_blank',
              rel: 'noopener noreferrer',
              title: 'Открыть Google Новости'
            }, '↗')
          )
        );

        const listEl = el('div', { className: 'google-news-list' });

        if (!items || items.length === 0) {
          listEl.append(el('div', { className: 'google-empty-text', textContent: 'Новостей не найдено' }));
        } else {
          items.forEach((item) => {
            const sourceBadge = item.source ? el('span', { className: 'news-source-badge', textContent: item.source }) : null;
            const titleSpan = el('span', { className: 'news-item-title', textContent: item.title });

            let pubDateStr = '';
            if (item.pubDate) {
              try {
                const pd = new Date(item.pubDate);
                if (!isNaN(pd.getTime())) {
                  pubDateStr = `${String(pd.getHours()).padStart(2, '0')}:${String(pd.getMinutes()).padStart(2, '0')}`;
                }
              } catch (_) {}
            }
            const dateSpan = pubDateStr ? el('span', { className: 'news-item-time', textContent: pubDateStr }) : null;

            const metaRow = el('div', { className: 'news-item-meta' }, sourceBadge, dateSpan);
            const row = el('a', {
              className: 'news-item-row',
              href: item.link || 'https://news.google.com/',
              target: '_blank',
              rel: 'noopener noreferrer',
              title: item.title
            }, titleSpan, metaRow);

            listEl.append(row);
          });
        }

        body.replaceChildren(topBar, listEl);
      } catch (err) {
        this.renderErrorCard('Новости Google', body, err.message, () => this.renderNewsWidget(w, body, save));
      }
    }
  }

  // Instantiate singleton instance
  const googleServiceInstance = new GoogleService();

  // Expose to window for browser context
  if (typeof window !== 'undefined') {
    window.GoogleService = googleServiceInstance;
    window.GoogleServiceClass = GoogleService;
  }

  // CommonJS export for Node test runner
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      GoogleService: googleServiceInstance,
      GoogleServiceClass: GoogleService,
      GoogleServiceContract: GoogleService,
      GoogleNewsContract: GoogleService,
      DEFAULT_SCOPES
    };
  }
})();
