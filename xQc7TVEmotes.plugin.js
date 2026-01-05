/**
 * @name xQc7TVEmotes
 * @author valerie.sh
 * @description Displays 7TV emotes from xQc's emote set (or any custom 7TV emote set) in Discord messages
 * @version 1.5.0
 * @authorId 1312596471778115627
 * @source https://github.com/atvalerie/agiwtrebivhdvd
 * @updateUrl https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js
 */

// --- Constants ---
const PLUGIN_CONSTANTS = {
    NAME: "xQc7TVEmotes",
    VERSION: "1.5.0", // Updated version
    AUTHOR: "valerie.sh",
    DESCRIPTION: "Displays 7TV emotes from any 7TV emote set in Discord messages",
    DEFAULT_SETTINGS: {
        emoteSetId: "01FE9DRF000009TR6M9N941CYW",
        emoteSize: 32,
        pickerEmoteSize: 40,
        hoverEmoteSize: 128,
        matchMode: "word",
        showTooltips: true,
        resizeDiscordEmotes: false,
        debugMode: false
    },
    API_URL: "https://api.7tv.app/v3/emote-sets/",
    GITHUB_API_URL: "https://api.github.com/repos/atvalerie/agiwtrebivhdvd/commits?per_page=20",
    UPDATE_URL: "https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js",
    STYLESHEET_ID: "x7tv-emotes-styles",
    DISCORD_EMOTE_STYLESHEET_ID: "x7tv-discord-emote-styles",
    PROCESSED_DATA_ATTR: "data-x7tv-processed",
    TOOLTIP_ID: "x7tv-tooltip",
    PICKER_ID: "x7tv-picker",
    PICKER_GRID_ID: "x7tv-picker-grid",
    PICKER_FOOTER_ID: "x7tv-picker-footer",
    PICKER_BTN_CLASS: "x7tv-picker-btn",
    EMOTE_CONTAINER_CLASS: "x7tv-emote-container",
    EMOTE_CLASS: "x7tv-emote",
    MESSAGE_CONTENT_SELECTOR: '[class*="messageContent"]',
    EMOJI_REGEX: /<a?:([^:]+):([A-Za-z0-9]+)>/g,
    COLON_EMOJI_REGEX: /:([^:\s]+):/g, // Added for message sending patch
    // ... other selectors and constants
};

// --- Utility Functions (Could be in a separate module) ---
const Utils = {
    log: (message, ...args) => {
        if (PLUGIN_CONSTANTS.DEBUG_MODE) {
            console.log(`[${PLUGIN_CONSTANTS.NAME}]`, message, ...args);
        }
    },
    isNewerVersion: (remote, local) => {
        const remoteParts = remote.split('.').map(Number);
        const localParts = local.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (remoteParts[i] > localParts[i]) return true;
            if (remoteParts[i] < localParts[i]) return false;
        }
        return false;
    },
    escapeRegex: (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    // Add other utility functions here (e.g., deep merge, safe DOM access)
};

// --- Settings Manager Module (Conceptual) ---
class SettingsManager {
    constructor(pluginName) {
        this.pluginName = pluginName;
        this.settings = { ...PLUGIN_CONSTANTS.DEFAULT_SETTINGS }; // Start with defaults
    }

    load() {
        try {
            const saved = BdApi?.Data?.load(this.pluginName, "settings");
            if (saved) {
                this.settings = { ...PLUGIN_CONSTANTS.DEFAULT_SETTINGS, ...saved }; // Merge with defaults
                Utils.log("Settings loaded from BdApi:", this.settings);
            } else {
                Utils.log("No saved settings found, using defaults.");
            }
        } catch (e) {
            console.error(`[${PLUGIN_CONSTANTS.NAME}] Error loading settings:`, e);
            // Keep defaults if loading fails
        }
    }

    save() {
        try {
            BdApi?.Data?.save(this.pluginName, "settings", this.settings);
            Utils.log("Settings saved to BdApi:", this.settings);
        } catch (e) {
            console.error(`[${PLUGIN_CONSTANTS.NAME}] Error saving settings:`, e);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.save(); // Auto-save on change
    }
}

// --- Emote Cache Module (Conceptual) ---
class EmoteCache {
    constructor() {
        this.emoteMap = new Map(); // Use Map for potentially better performance
        this.namesLower = new Map();
        this.namesSorted = [];
        this.sevenTVIds = new Set();
        this.searchIndex = new Map();
    }

    update(emotesData) {
        this.emoteMap.clear();
        this.namesLower.clear();
        this.namesSorted = [];
        this.sevenTVIds.clear();
        this.searchIndex.clear();

        if (!Array.isArray(emotesData)) return;

        for (const emote of emotesData) {
            const hostUrl = emote.data?.host?.url;
            if (hostUrl) {
                const baseUrl = `https:${hostUrl}`;
                const emoteInfo = {
                    url: `${baseUrl}/2x.webp`,
                    previewUrl: `${baseUrl}/3x.webp`,
                    baseUrl: baseUrl,
                    animated: emote.data.animated || false,
                    id: emote.id,
                    creator: emote.data?.owner?.display_name || emote.data?.owner?.username || "Unknown"
                };
                this.emoteMap.set(emote.name, emoteInfo);
            }
        }
        this._buildCaches();
    }

    _buildCaches() {
        const names = Array.from(this.emoteMap.keys());
        this.namesSorted = [...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
        this.namesLower = new Map(names.map(name => [name.toLowerCase(), name]));
        this.sevenTVIds = new Set(Array.from(this.emoteMap.values()).map(e => e.id));

        // Build search index
        for (const name of names) {
            const lower = name.toLowerCase();
            for (let i = 0; i < Math.min(lower.length, 3); i++) {
                const prefix = lower.slice(0, i + 1);
                if (!this.searchIndex.has(prefix)) {
                    this.searchIndex.set(prefix, []);
                }
                this.searchIndex.get(prefix).push({ name, lower });
            }
        }
        // Sort each prefix group
        for (const [prefix, items] of this.searchIndex) {
            items.sort((a, b) => {
                if (a.lower === prefix) return -1;
                if (b.lower === prefix) return 1;
                const aStarts = a.lower.startsWith(prefix);
                const bStarts = b.lower.startsWith(prefix);
                if (aStarts && !bStarts) return -1;
                if (bStarts && !aStarts) return 1;
                return a.lower.localeCompare(b.lower);
            });
        }
    }

    getEmote(name) {
        return this.emoteMap.get(name) || this.emoteMap.get(this.namesLower.get(name.toLowerCase()));
    }

    getNamesSorted() { return this.namesSorted; }
    getSearchIndex() { return this.searchIndex; }
    getSevenTVIds() { return this.sevenTVIds; }
    getEmoteMap() { return this.emoteMap; }
}

// --- Main Plugin Class (Refactored) ---
module.exports = class xQc7TVEmotes {
    constructor() {
        this.name = PLUGIN_CONSTANTS.NAME;
        this.version = PLUGIN_CONSTANTS.VERSION;
        this.author = PLUGIN_CONSTANTS.AUTHOR;
        this.description = PLUGIN_CONSTANTS.DESCRIPTION;

        this.settingsManager = new SettingsManager(this.name);
        this.emoteCache = new EmoteCache();
        this.emotesLoaded = false;

        // State Management
        this.state = {
            observer: null,
            styleElement: null,
            discordEmoteStyleElement: null,
            updateCheckInterval: null,
            updateNoticeClose: null,
            pickerOpen: false,
            pickerClickHandler: null,
            autocompleteOpen: false,
            autocompleteSelectedIndex: 0,
            autocompleteMatches: [],
            autocompleteQuery: '',
            currentRandomEmote: null,
        };

        // Ensure BdApi is available before proceeding
        if (!BdApi) {
            console.error(`[${this.name}] BdApi is not available. Plugin cannot start.`);
            return;
        }
    }

    // --- Lifecycle Methods ---
    start() {
        Utils.log("Starting plugin...");
        this.settingsManager.load();
        this._injectStyles();
        this._checkForUpdatesOnLaunch();
        this._loadEmotesAndSetup().catch(err => {
            console.error(`[${this.name}] Critical error during startup:`, err);
            BdApi.UI?.showToast?.("Failed to load emotes!", { type: "error" });
        });
    }

    stop() {
        Utils.log("Stopping plugin...");
        this._removeStyles();
        this._removeObserver();
        this._removePickerButton();
        this._closePicker();
        this._removeAutocomplete();
        this._cleanupEmotes();
        this._clearUpdateCheckInterval();
        this._closeUpdateNotice();
        this.emoteCache = new EmoteCache(); // Reset cache
        this.emotesLoaded = false;
    }

    // --- Core Functionality ---
    async _loadEmotesAndSetup() {
        const emoteSetId = this.settingsManager.get('emoteSetId');
        if (!emoteSetId) {
            throw new Error("No emote set ID configured.");
        }
        const apiUrl = `${PLUGIN_CONSTANTS.API_URL}${emoteSetId}`;
        Utils.log(`Fetching emotes from: ${apiUrl}`);

        try {
            const response = await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.emotes || !Array.isArray(data.emotes)) {
                throw new Error("Invalid response format from 7TV API");
            }
            this.emoteCache.update(data.emotes);
            this.emotesLoaded = true;
            Utils.log(`Loaded ${this.emoteCache.getEmoteMap().size} emotes`);
        } catch (error) {
            console.error(`[${this.name}] Failed to load emotes:`, error);
            throw error; // Re-throw to be caught by caller
        }

        // Setup after successful load
        this._setupObserver();
        this._processExistingMessages();
        this._setupPickerButton();
        this._setupAutocomplete();
        BdApi.UI?.showToast?.(`Loaded ${this.emoteCache.getEmoteMap().size} emotes!`, { type: "success" });
    }

    _processExistingMessages() {
        if (!this.emotesLoaded) return;
        const messageContents = document.querySelectorAll(PLUGIN_CONSTANTS.MESSAGE_CONTENT_SELECTOR);
        messageContents.forEach(content => this._processMessageContent(content));
        Utils.log(`Processed ${messageContents.length} existing messages`);
    }

    _processMessageContent(element) {
        if (!element || element.dataset[PLUGIN_CONSTANTS.PROCESSED_DATA_ATTR]) return;
        element.dataset[PLUGIN_CONSTANTS.PROCESSED_DATA_ATTR] = "true";
        this._processTextNodes(element);
    }

    _processTextNodes(element) {
        // Use TreeWalker as before
        const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
            textNodes.push(node);
        }
        for (const textNode of textNodes) {
            this._processTextNode(textNode);
        }
    }

    _processTextNode(textNode) {
        const text = textNode.textContent;
        if (!text || !text.trim()) return;

        // Skip code blocks
        if (textNode.parentElement?.closest('[class*="hljs"]')) return;

        const size = this.settingsManager.get('emoteSize');
        const mode = this.settingsManager.get('matchMode');
        const showTooltips = this.settingsManager.get('showTooltips');

        // Build pattern based on mode and cache it per mode
        let pattern;
        switch (mode) {
            case "colon":
                // This regex is for matching, not replacing in this context, adjust if needed
                // For replacement, we need to handle :emoteName: -> emoteName in send patch
                pattern = PLUGIN_CONSTANTS.COLON_EMOJI_REGEX;
                break;
            case "insensitive":
                // Build dynamic pattern from cache
                const insensitivePattern = new RegExp(`(?:^|\\s)(${Array.from(this.emoteCache.getEmoteMap().keys()).map(Utils.escapeRegex).join("|")})(?=\\s|$)`, "gi");
                pattern = insensitivePattern;
                break;
            default: // "word"
                const wordPattern = new RegExp(`(?:^|\\s)(${Array.from(this.emoteCache.getEmoteMap().keys()).map(Utils.escapeRegex).join("|")})(?=\\s|$)`, "g");
                pattern = wordPattern;
        }

        // This is a simplified replacement logic. The actual replacement might need more careful handling,
        // especially for insensitive mode and performance. Consider using a more efficient algorithm
        // if performance becomes an issue with very long messages.
        const matches = [...text.matchAll(pattern)];
        if (matches.length === 0) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        for (const match of matches) {
            const [fullMatch, capturedName] = match;
            let emoteName = capturedName || fullMatch.trim();
            if (mode === "colon") emoteName = emoteName.slice(1, -1); // Remove colons

            let emote = this.emoteCache.getEmote(emoteName);
            if (!emote) continue; // If insensitive didn't find it either

            // Add text before match
            if (match.index > lastIndex) {
                fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
            }

            // Add leading space if present in original match
            const leadingSpace = fullMatch.match(/^\s+/);
            if (leadingSpace) {
                fragment.appendChild(document.createTextNode(leadingSpace[0]));
            }

            // Create and add emote element
            const emoteElement = this._createEmoteElement(emoteName, emote, size, showTooltips);
            fragment.appendChild(emoteElement);

            lastIndex = match.index + fullMatch.length;
        }

        // Add remaining text after last match
        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        if (fragment.hasChildNodes()) { // Only replace if fragment has content
            textNode.parentNode.replaceChild(fragment, textNode);
        }
    }

    _createEmoteElement(name, emote, size, showTooltips) {
        const container = document.createElement("span");
        container.className = PLUGIN_CONSTANTS.EMOTE_CONTAINER_CLASS;
        const img = document.createElement("img");
        img.src = emote.url;
        img.alt = name;
        img.className = PLUGIN_CONSTANTS.EMOTE_CLASS;
        img.style.height = `${size}px`;
        img.style.width = "auto";
        img.draggable = false;
        if (showTooltips) {
            img.addEventListener("mouseenter", (e) => this._showTooltip(e, name, emote));
            img.addEventListener("mouseleave", () => this._hideTooltip());
        }
        img.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this._showEmoteContextMenu(e, name, emote);
        });
        container.appendChild(img);
        return container;
    }

    // --- Tooltip ---
    _showTooltip(event, emoteName, emote) {
        this._hideTooltip();
        const tooltip = document.createElement("div");
        tooltip.className = "x7tv-tooltip"; // From CSS
        tooltip.id = PLUGIN_CONSTANTS.TOOLTIP_ID;
        tooltip.style.visibility = "hidden";

        const hoverSize = this.settingsManager.get('hoverEmoteSize');
        const preview = document.createElement("img");
        preview.className = "x7tv-tooltip-preview"; // From CSS
        preview.src = `${emote.baseUrl}/4x.webp`;
        preview.alt = emoteName;
        preview.style.maxWidth = `${hoverSize}px`;
        preview.style.maxHeight = `${hoverSize}px`;
        tooltip.appendChild(preview);

        const nameEl = document.createElement("div");
        nameEl.className = "x7tv-tooltip-name"; // From CSS
        nameEl.textContent = emoteName;
        tooltip.appendChild(nameEl);

        const creatorEl = document.createElement("div");
        creatorEl.className = "x7tv-tooltip-creator"; // From CSS
        creatorEl.textContent = `by ${emote.creator}`;
        tooltip.appendChild(creatorEl);

        document.body.appendChild(tooltip);

        const positionTooltip = () => {
            const rect = event.target.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            tooltip.style.left = `${rect.left + (rect.width / 2) - (tooltipRect.width / 2)}px`;
            tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
            tooltip.style.visibility = "visible";
        };

        if (preview.complete) {
            positionTooltip();
        } else {
            preview.onload = positionTooltip;
        }
    }

    _hideTooltip() {
        const existing = document.getElementById(PLUGIN_CONSTANTS.TOOLTIP_ID);
        if (existing) existing.remove();
    }

    // --- Context Menu ---
    _showEmoteContextMenu(event, emoteName, emote) {
        const sevenTvUrl = `https://old.7tv.app/emotes/${emote.id}`;
        const url1x = `${emote.baseUrl}/1x.webp`;
        const url2x = `${emote.baseUrl}/2x.webp`;
        const url4x = `${emote.baseUrl}/4x.webp`;

        BdApi.ContextMenu?.open?.(event, BdApi.ContextMenu.buildMenu([
            {
                type: "submenu",
                label: "Open",
                id: "x7tv-open",
                items: [
                    { type: "text", id: "x7tv-open-7tv", label: "7TV Page", action: () => window.open(sevenTvUrl, "_blank") },
                                                                     { type: "separator", id: "x7tv-open-sep" },
                                                                     { type: "text", id: "x7tv-open-1x", label: "1x Image", action: () => window.open(url1x, "_blank") },
                                                                     { type: "text", id: "x7tv-open-2x", label: "2x Image", action: () => window.open(url2x, "_blank") },
                                                                     { type: "text", id: "x7tv-open-4x", label: "4x Image", action: () => window.open(url4x, "_blank") }
                ]
            },
            {
                type: "submenu",
                label: "Copy Link",
                id: "x7tv-copy",
                items: [
                    { type: "text", id: "x7tv-copy-7tv", label: "7TV Page", action: () => { navigator.clipboard.writeText(sevenTvUrl); BdApi.UI?.showToast?.("Copied 7TV link!", { type: "success" }); } },
                                                                     { type: "separator", id: "x7tv-copy-sep" },
                                                                     { type: "text", id: "x7tv-copy-1x", label: "1x Image", action: () => { navigator.clipboard.writeText(url1x); BdApi.UI?.showToast?.("Copied 1x link!", { type: "success" }); } },
                                                                     { type: "text", id: "x7tv-copy-2x", label: "2x Image", action: () => { navigator.clipboard.writeText(url2x); BdApi.UI?.showToast?.("Copied 2x link!", { type: "success" }); } },
                                                                     { type: "text", id: "x7tv-copy-4x", label: "4x Image", action: () => { navigator.clipboard.writeText(url4x); BdApi.UI?.showToast?.("Copied 4x link!", { type: "success" }); } }
                ]
            }
        ]));
    }

    // --- Observer ---
    _setupObserver() {
        if (this.state.observer) this._removeObserver(); // Ensure only one observer
        this.state.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this._processNode(node);
                    }
                }
                if (mutation.type === "childList" && mutation.target.matches?.(PLUGIN_CONSTANTS.MESSAGE_CONTENT_SELECTOR)) {
                    delete mutation.target.dataset[PLUGIN_CONSTANTS.PROCESSED_DATA_ATTR];
                    this._processMessageContent(mutation.target);
                }
            }
        });
        this.state.observer.observe(document.body, { childList: true, subtree: true });
        Utils.log("Observer setup complete");
    }

    _processNode(node) {
        if (!this.emotesLoaded) return;
        if (node.matches && node.matches(PLUGIN_CONSTANTS.MESSAGE_CONTENT_SELECTOR)) {
            this._processMessageContent(node);
        }
        const messageContents = node.querySelectorAll?.(PLUGIN_CONSTANTS.MESSAGE_CONTENT_SELECTOR);
        if (messageContents) {
            messageContents.forEach(content => this._processMessageContent(content));
        }
    }

    _removeObserver() {
        if (this.state.observer) {
            this.state.observer.disconnect();
            this.state.observer = null;
        }
    }

    // --- Styles ---
    _injectStyles() {
        // ... CSS string from original code ...
        const css = `
        .x7tv-emote {
            display: inline-block;
            vertical-align: middle;
            object-fit: contain;
            margin: 0 2px;
            cursor: pointer;
        }
        .x7tv-emote-container {
            display: inline;
        }
        .x7tv-tooltip {
            position: absolute;
            background: #18191c;
            color: #dcddde;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 9999;
            pointer-events: none;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.24);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            min-width: 120px;
        }
        .x7tv-tooltip-preview {
            max-width: 96px;
            max-height: 96px;
            object-fit: contain;
        }
        .x7tv-tooltip-name {
            font-weight: 600;
            font-size: 14px;
            color: #ffffff;
        }
        .x7tv-tooltip-creator {
            font-size: 12px;
            color: #8e9297;
        }
        .x7tv-tooltip::after {
            content: "";
            position: absolute;
            top: 100%;
            left: 50%;
            margin-left: -5px;
            border-width: 5px;
            border-style: solid;
            border-color: #18191c transparent transparent transparent;
        }
        /* Settings panel styles */
        .x7tv-settings {
            padding: 16px;
        }
        .x7tv-setting-group {
            margin-bottom: 20px;
        }
        .x7tv-setting-label {
            color: var(--header-primary);
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 4px;
        }
        .x7tv-setting-note {
            color: var(--text-muted);
            font-size: 12px;
            margin-bottom: 8px;
        }
        .x7tv-setting-input {
            width: 100%;
            padding: 10px;
            border-radius: 4px;
            border: none;
            background: var(--input-background);
            color: var(--text-normal);
            font-size: 14px;
        }
        .x7tv-setting-select {
            width: 100%;
            padding: 10px;
            border-radius: 4px;
            border: none;
            background: var(--input-background);
            color: var(--text-normal);
            font-size: 14px;
        }
        .x7tv-setting-slider {
            width: 100%;
            margin: 8px 0;
        }
        .x7tv-setting-switch {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .x7tv-switch {
            position: relative;
            width: 44px;
            height: 24px;
        }
        .x7tv-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .x7tv-switch-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--input-background);
            transition: 0.2s;
            border-radius: 24px;
        }
        .x7tv-switch-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: 0.2s;
            border-radius: 50%;
        }
        .x7tv-switch input:checked + .x7tv-switch-slider {
            background-color: var(--brand-experiment);
        }
        .x7tv-switch input:checked + .x7tv-switch-slider:before {
            transform: translateX(20px);
        }
        .x7tv-button {
            padding: 10px 16px;
            border-radius: 4px;
            border: none;
            background: var(--brand-experiment);
            color: white;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            width: 100%;
            margin-top: 8px;
        }
        .x7tv-button:hover {
            background: var(--brand-experiment-560);
        }
        .x7tv-emote-count {
            color: var(--text-muted);
            font-size: 12px;
            margin-top: 8px;
            text-align: center;
        }
        /* Picker button */
        .x7tv-picker-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            border-radius: 4px;
            cursor: pointer;
            background: transparent;
            border: none;
            padding: 0;
        }
        .x7tv-picker-btn:hover {
            background: var(--background-modifier-hover);
        }
        .x7tv-picker-btn svg {
            width: 22px;
            height: 22px;
            color: var(--interactive-text-default);
            transition: color 0.15s;
        }
        .x7tv-picker-btn:hover svg {
            color: #00b4ff;
        }
        /* Picker popup */
        .x7tv-picker {
            position: absolute;
            bottom: 100%;
            right: 0;
            width: 420px;
            height: 450px;
            background: var(--background-surface-high);
            border-radius: 8px;
            box-shadow: var(--shadow-high);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            z-index: 1000;
            margin-bottom: 8px;
        }
        .x7tv-picker-header {
            padding: 12px 0;
            margin: 0 16px;
            border-bottom: 1px solid var(--border-faint);
        }
        .x7tv-picker-search {
            width: 100%;
            padding: 8px 12px;
            border-radius: 4px;
            border: none;
            background: var(--input-background);
            color: var(--text-default);
            font-size: 14px;
            outline: none;
        }
        .x7tv-picker-search::placeholder {
            color: var(--text-muted);
        }
        .x7tv-picker-grid {
            flex: 1;
            overflow-y: auto;
            padding: 8px 16px;
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            align-content: start;
        }
        .x7tv-picker-emote {
            height: 48px;
            min-width: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 4px;
            cursor: pointer;
            padding: 4px;
            flex-shrink: 0;
        }
        .x7tv-picker-emote:hover {
            background: var(--background-modifier-hover);
        }
        .x7tv-picker-emote img {
            max-height: 40px;
            width: auto;
            object-fit: contain;
        }
        .x7tv-picker-empty {
            width: 100%;
            text-align: center;
            color: var(--text-muted);
            padding: 20px;
        }
        .x7tv-picker-footer {
            padding: 8px 0;
            margin: 0 16px;
            border-top: 1px solid var(--border-faint);
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 40px;
        }
        .x7tv-picker-footer img {
            width: 24px;
            height: 24px;
            object-fit: contain;
        }
        .x7tv-picker-footer-name {
            color: var(--text-default);
            font-weight: 500;
        }
        .x7tv-picker-footer-creator {
            color: var(--text-muted);
            font-size: 12px;
        }
        /* Fix emotes in reply previews - make them smaller to prevent clipping */
        [class*="repliedTextContent"] .x7tv-emote,
        [class*="repliedTextPreview"] .x7tv-emote {
            height: 16px !important;
            width: auto !important;
            vertical-align: middle !important;
        }
        [class*="repliedTextContent"] [class*="emojiContainer"],
        [class*="repliedTextPreview"] [class*="emojiContainer"] {
            height: 16px !important;
            vertical-align: middle !important;
            display: inline-flex !important;
            align-items: center !important;
        }
        [class*="repliedTextContent"] img.emoji,
        [class*="repliedTextPreview"] img.emoji,
        [class*="repliedTextContent"] img[data-type="emoji"],
        [class*="repliedTextPreview"] img[data-type="emoji"] {
            height: 16px !important;
            width: 16px !important;
            min-height: unset !important;
            max-height: 16px !important;
            vertical-align: middle !important;
            object-fit: contain !important;
            position: relative !important;
            top: -2px !important;
        }
        `;

        this.state.styleElement = document.createElement("style");
        this.state.styleElement.id = PLUGIN_CONSTANTS.STYLESHEET_ID;
        this.state.styleElement.textContent = css;
        document.head.appendChild(this.state.styleElement);

        this.state.discordEmoteStyleElement = document.createElement("style");
        this.state.discordEmoteStyleElement.id = PLUGIN_CONSTANTS.DISCORD_EMOTE_STYLESHEET_ID;
        document.head.appendChild(this.state.discordEmoteStyleElement);
        this._updateDiscordEmoteStyles();
    }

    _updateDiscordEmoteStyles() {
        if (!this.state.discordEmoteStyleElement) return;
        if (this.settingsManager.get('resizeDiscordEmotes')) {
            const size = this.settingsManager.get('emoteSize');
            this.state.discordEmoteStyleElement.textContent = `
            [class*="messageContent"] .emoji[data-type="emoji"],
            [class*="messageContent"] img.emoji {
                height: ${size}px !important;
                width: auto !important;
                vertical-align: middle !important;
            }
            `;
        } else {
            this.state.discordEmoteStyleElement.textContent = '';
        }
    }

    _removeStyles() {
        if (this.state.styleElement) {
            this.state.styleElement.remove();
            this.state.styleElement = null;
        }
        if (this.state.discordEmoteStyleElement) {
            this.state.discordEmoteStyleElement.remove();
            this.state.discordEmoteStyleElement = null;
        }
    }

    // --- Cleanup ---
    _cleanupEmotes() {
        document.querySelectorAll(`[${PLUGIN_CONSTANTS.PROCESSED_DATA_ATTR}]`).forEach(el => {
            delete el.dataset[PLUGIN_CONSTANTS.PROCESSED_DATA_ATTR];
        });
        document.querySelectorAll(`.${PLUGIN_CONSTANTS.EMOTE_CONTAINER_CLASS}`).forEach(el => {
            const text = el.querySelector('img')?.alt || '';
            const textNode = document.createTextNode(text);
            el.parentNode?.replaceChild(textNode, el);
        });
        this._hideTooltip();
    }

    // --- Update Check (Conceptual - would be moved to an Updater module) ---
    _checkForUpdatesOnLaunch() {
        this._checkForUpdates();
        this.state.updateCheckInterval = setInterval(() => this._checkForUpdates(), 15 * 60 * 1000); // 15 minutes
    }

    _clearUpdateCheckInterval() {
        if (this.state.updateCheckInterval) {
            clearInterval(this.state.updateCheckInterval);
            this.state.updateCheckInterval = null;
        }
    }

    _closeUpdateNotice() {
        if (this.state.updateNoticeClose) {
            this.state.updateNoticeClose();
            this.state.updateNoticeClose = null;
        }
    }

    async _checkForUpdates() {
        try {
            Utils.log("Checking for updates...");
            const response = await fetch(PLUGIN_CONSTANTS.UPDATE_URL);
            const text = await response.text();
            const versionMatch = text.match(/@version\s+(\d+\.\d+\.\d+)/);
            if (!versionMatch) {
                Utils.log("Could not find version in remote file");
                return;
            }
            const remoteVersion = versionMatch[1];
            const localVersion = this.version; // Use the class version or settings version if updatable
            Utils.log(`Local: v${localVersion}, Remote: v${remoteVersion}`);

            if (Utils.isNewerVersion(remoteVersion, localVersion)) {
                Utils.log("Update available!");
                this._showUpdateNotice(remoteVersion);
            } else {
                Utils.log("Already up to date");
            }
        } catch (err) {
            console.error(`[${this.name}] Failed to check for updates:`, err);
        }
    }

    _showUpdateNotice(newVersion) {
        // This logic would also be moved to an Updater module
        const closeNotice = BdApi.UI?.showNotice?.(
            `xQc7TVEmotes update available! v${this.version} → v${newVersion}`,
            {
                type: "info",
                buttons: [
                    {
                        label: "Update Now",
                        onClick: () => {
                            closeNotice();
                            // Call updater function
                        }
                    },
                    {
                        label: "View Changes",
                        onClick: () => {
                            // Call changelog function
                        }
                    },
                    {
                        label: "Later",
                        onClick: () => closeNotice()
                    }
                ]
            }
        );
        this.state.updateNoticeClose = closeNotice;
    }


    // --- Settings Panel (Could be moved to SettingsManager) ---
    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.className = "x7tv-settings";

        // Emote Set ID
        panel.appendChild(this._createTextSetting("7TV Emote Set ID", "The ID of the 7TV emote set to use. Default is xQc's emote set.", "emoteSetId"));

        // Emote Size
        panel.appendChild(this._createSliderSetting("Emote Size", "Size of emotes in messages", "emoteSize", 16, 128, "px", () => this._updateDiscordEmoteStyles()));

        // Picker Emote Size
        panel.appendChild(this._createSliderSetting("Picker Emote Size", "Size of emotes in the picker", "pickerEmoteSize", 24, 64, "px"));

        // Hover Emote Size
        panel.appendChild(this._createSliderSetting("Hover Preview Size", "Size of emote preview when hovering", "hoverEmoteSize", 64, 256, "px"));

        // Match Mode
        panel.appendChild(this._createSelectSetting("Match Mode", "How to match emote names in messages", "matchMode", [
            { label: "Exact word match", value: "word" },
            { label: "Case insensitive", value: "insensitive" },
            { label: "Wrapped in colons :emote:", value: "colon" }
        ]));

        // Show Tooltips
        panel.appendChild(this._createSwitchSetting("Show Tooltips", "Show emote name when hovering over emotes", "showTooltips"));

        // Resize Discord Emotes
        panel.appendChild(this._createSwitchSetting("Resize Discord Emotes", "Make Discord emotes the same size as 7TV emotes", "resizeDiscordEmotes", () => this._updateDiscordEmoteStyles()));

        // Debug Mode
        panel.appendChild(this._createSwitchSetting("Debug Mode", "Log debug information to console", "debugMode"));

        // Reload button
        const reloadBtn = document.createElement("button");
        reloadBtn.className = "x7tv-button";
        reloadBtn.textContent = "Reload Emotes";
        reloadBtn.onclick = () => {
            this._loadEmotesAndSetup().then(() => {
                BdApi.UI?.showToast?.(`Loaded ${this.emoteCache.getEmoteMap().size} emotes!`, { type: "success" });
                this._cleanupEmotes();
                this._processExistingMessages();
                emoteCount.textContent = `Currently loaded: ${this.emoteCache.getEmoteMap().size} emotes`;
            }).catch(err => {
                BdApi.UI?.showToast?.("Failed to reload emotes!", { type: "error" });
            });
        };
        panel.appendChild(reloadBtn);

        // Emote count
        const emoteCount = document.createElement("div");
        emoteCount.className = "x7tv-emote-count";
        emoteCount.textContent = `Currently loaded: ${this.emoteCache.getEmoteMap().size} emotes`;
        panel.appendChild(emoteCount);

        return panel;
    }

    // --- Settings Panel Helper Methods (Could be in SettingsManager) ---
    _createTextSetting(label, note, settingKey) {
        const group = document.createElement("div");
        group.className = "x7tv-setting-group";
        const labelEl = document.createElement("div");
        labelEl.className = "x7tv-setting-label";
        labelEl.textContent = label;
        group.appendChild(labelEl);
        const noteEl = document.createElement("div");
        noteEl.className = "x7tv-setting-note";
        noteEl.textContent = note;
        group.appendChild(noteEl);
        const input = document.createElement("input");
        input.className = "x7tv-setting-input";
        input.type = "text";
        input.value = this.settingsManager.get(settingKey);
        input.onchange = (e) => {
            this.settingsManager.set(settingKey, e.target.value);
        };
        group.appendChild(input);
        return group;
    }

    _createSliderSetting(label, note, settingKey, min, max, units, onChange) {
        const group = document.createElement("div");
        group.className = "x7tv-setting-group";
        const labelEl = document.createElement("div");
        labelEl.className = "x7tv-setting-label";
        labelEl.textContent = `${label}: ${this.settingsManager.get(settingKey)}${units}`;
        group.appendChild(labelEl);
        const noteEl = document.createElement("div");
        noteEl.className = "x7tv-setting-note";
        noteEl.textContent = note;
        group.appendChild(noteEl);
        const slider = document.createElement("input");
        slider.className = "x7tv-setting-slider";
        slider.type = "range";
        slider.min = min;
        slider.max = max;
        slider.value = this.settingsManager.get(settingKey);
        slider.oninput = (e) => {
            const value = parseInt(e.target.value);
            this.settingsManager.set(settingKey, value);
            labelEl.textContent = `${label}: ${value}${units}`;
            if (onChange) onChange();
        };
            group.appendChild(slider);
            return group;
    }

    _createSelectSetting(label, note, settingKey, options) {
        const group = document.createElement("div");
        group.className = "x7tv-setting-group";
        const labelEl = document.createElement("div");
        labelEl.className = "x7tv-setting-label";
        labelEl.textContent = label;
        group.appendChild(labelEl);
        const noteEl = document.createElement("div");
        noteEl.className = "x7tv-setting-note";
        noteEl.textContent = note;
        group.appendChild(noteEl);
        const select = document.createElement("select");
        select.className = "x7tv-setting-select";
        for (const opt of options) {
            const option = document.createElement("option");
            option.value = opt.value;
            option.textContent = opt.label;
            option.selected = this.settingsManager.get(settingKey) === opt.value;
            select.appendChild(option);
        }
        select.onchange = (e) => {
            this.settingsManager.set(settingKey, e.target.value);
        };
        group.appendChild(select);
        return group;
    }

    _createSwitchSetting(label, note, settingKey, onChange) {
        const group = document.createElement("div");
        group.className = "x7tv-setting-group";
        const wrapper = document.createElement("div");
        wrapper.className = "x7tv-setting-switch";
        const textWrapper = document.createElement("div");
        const labelEl = document.createElement("div");
        labelEl.className = "x7tv-setting-label";
        labelEl.textContent = label;
        textWrapper.appendChild(labelEl);
        const noteEl = document.createElement("div");
        noteEl.className = "x7tv-setting-note";
        noteEl.textContent = note;
        textWrapper.appendChild(noteEl);
        wrapper.appendChild(textWrapper);
        const switchLabel = document.createElement("label");
        switchLabel.className = "x7tv-switch";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = this.settingsManager.get(settingKey);
        checkbox.onchange = (e) => {
            this.settingsManager.set(settingKey, e.target.checked);
            if (onChange) onChange();
        };
            switchLabel.appendChild(checkbox);
            const slider = document.createElement("span");
            slider.className = "x7tv-switch-slider";
            switchLabel.appendChild(slider);
            wrapper.appendChild(switchLabel);
            group.appendChild(wrapper);
            return group;
    }

    // --- Picker and Autocomplete Methods would follow similar refactoring ---
    // _setupPickerButton, _openPicker, _closePicker, _setupAutocomplete, _patchEmojiSearch, etc.
    // These would involve creating Picker and Autocomplete modules respectively.
    _setupPickerButton() { /* ... */ }
    _removePickerButton() { /* ... */ }
    _closePicker() { /* ... */ }
    _setupAutocomplete() { /* ... */ }
    _removeAutocomplete() { /* ... */ }
};
