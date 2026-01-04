/**
 * @name xQc7TVEmotes
 * @author valerie.sh
 * @description Displays 7TV emotes from xQc's emote set (or any custom 7TV emote set) in Discord messages
 * @version 1.3.2
 * @authorId 1312596471778115627
 * @source https://github.com/atvalerie/agiwtrebivhdvd
 * @updateUrl https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js
 */

module.exports = class xQc7TVEmotes {
    constructor() {
        this.name = "xQc7TVEmotes";
        this.version = "1.3.2";
        this.author = "valerie.sh";
        this.description = "Displays 7TV emotes from any 7TV emote set in Discord messages";

        // Default settings
        this.defaultSettings = {
            emoteSetId: "01FE9DRF000009TR6M9N941CYW",
            emoteSize: 32,
            pickerEmoteSize: 40,
            hoverEmoteSize: 128,
            matchMode: "word",
            showTooltips: true,
            resizeDiscordEmotes: false,
            debugMode: false
        };

        this.settings = null;
        this.emoteMap = {};
        this.emotesLoaded = false;
        this.observer = null;
        this.styleElement = null;
        this.pickerOpen = false;
        this.currentRandomEmote = null;

        // Autocomplete state
        this.autocompleteOpen = false;
        this.autocompleteSelectedIndex = 0;
        this.autocompleteMatches = [];
        this.autocompleteQuery = '';

        // Performance caches
        this.emoteNamesLower = null;  // Pre-computed lowercase names
        this.emoteNamesSorted = null; // Pre-sorted names for autocomplete
        this.sevenTVIds = null;       // Set of 7TV emote IDs
        this.emojiRegex = /<a?:([^:]+):([A-Za-z0-9]+)>/g;
    }

    // Load settings from BdApi
    loadSettings() {
        this.settings = Object.assign({}, this.defaultSettings, BdApi.Data.load(this.name, "settings"));
    }

    // Save settings to BdApi
    saveSettings() {
        BdApi.Data.save(this.name, "settings", this.settings);
    }

    log(...args) {
        if (this.settings?.debugMode) {
            console.log(`[${this.name}]`, ...args);
        }
    }

    start() {
        this.loadSettings();
        this.log("Starting plugin...");
        this.injectStyles();

        // Check for updates
        this.checkForUpdates();

        this.loadEmotes().then(() => {
            this.setupObserver();
            this.processExistingMessages();
            this.setupPickerButton();
            this.setupAutocomplete();
            BdApi.UI.showToast(`Loaded ${Object.keys(this.emoteMap).length} emotes!`, { type: "success" });
        }).catch(err => {
            console.error(`[${this.name}]`, err);
            BdApi.UI.showToast("Failed to load emotes!", { type: "error" });
        });
    }

    async checkForUpdates() {
        try {
            const updateUrl = "https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js";
            console.log(`[${this.name}] Checking for updates...`);

            const response = await fetch(updateUrl);
            const text = await response.text();

            // Extract version from remote file
            const versionMatch = text.match(/@version\s+(\d+\.\d+\.\d+)/);
            if (!versionMatch) {
                console.log(`[${this.name}] Could not find version in remote file`);
                return;
            }

            const remoteVersion = versionMatch[1];
            const localVersion = this.version;

            console.log(`[${this.name}] Local: v${localVersion}, Remote: v${remoteVersion}`);

            if (this.isNewerVersion(remoteVersion, localVersion)) {
                console.log(`[${this.name}] Update available!`);
                this.showUpdateNotice(remoteVersion);
            } else {
                console.log(`[${this.name}] Already up to date`);
            }
        } catch (err) {
            console.error(`[${this.name}] Failed to check for updates:`, err);
        }
    }

    isNewerVersion(remote, local) {
        const remoteParts = remote.split('.').map(Number);
        const localParts = local.split('.').map(Number);

        for (let i = 0; i < 3; i++) {
            if (remoteParts[i] > localParts[i]) return true;
            if (remoteParts[i] < localParts[i]) return false;
        }
        return false;
    }

    showUpdateNotice(newVersion) {
        const closeNotice = BdApi.UI.showNotice(
            `xQc7TVEmotes update available! v${this.version} → v${newVersion}`,
            {
                type: "info",
                buttons: [
                    {
                        label: "Update Now",
                        onClick: () => {
                            closeNotice();
                            this.performUpdate();
                        }
                    },
                    {
                        label: "Later",
                        onClick: () => closeNotice()
                    }
                ]
            }
        );

        // Store close function for cleanup
        this.updateNoticeClose = closeNotice;
    }

    async performUpdate() {
        BdApi.UI.showToast("Downloading update...", { type: "info" });

        try {
            const updateUrl = "https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js";
            const response = await fetch(updateUrl);
            const newCode = await response.text();

            // Get plugin path
            const fs = require('fs');
            const path = require('path');
            const pluginsFolder = BdApi.Plugins.folder;
            const pluginPath = path.join(pluginsFolder, 'xQc7TVEmotes.plugin.js');

            // Write new code
            fs.writeFileSync(pluginPath, newCode, 'utf8');

            BdApi.UI.showToast("Update complete! Reloading plugin...", { type: "success" });

            // Reload plugin
            setTimeout(() => {
                BdApi.Plugins.reload(this.name);
            }, 1000);
        } catch (err) {
            console.error(`[${this.name}] Update failed:`, err);
            BdApi.UI.showToast("Update failed! Check console for details.", { type: "error" });
        }
    }

    stop() {
        this.log("Stopping plugin...");
        this.removeStyles();
        this.removeObserver();
        this.removePickerButton();
        this.closePicker();
        this.removeAutocomplete();
        this.cleanupEmotes();
        this.emoteMap = {};
        this.emotesLoaded = false;

        // Close update notice if present
        if (this.updateNoticeClose) {
            this.updateNoticeClose();
            this.updateNoticeClose = null;
        }
    }

    async loadEmotes() {
        const apiUrl = `https://api.7tv.app/v3/emote-sets/${this.settings.emoteSetId}`;
        this.log(`Fetching emotes from: ${apiUrl}`);

        try {
            const response = await fetch(apiUrl);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (!data.emotes || !Array.isArray(data.emotes)) {
                throw new Error("Invalid response format from 7TV API");
            }

            this.emoteMap = {};

            for (const emote of data.emotes) {
                const hostUrl = emote.data?.host?.url;
                if (hostUrl) {
                    const baseUrl = `https:${hostUrl}`;
                    this.emoteMap[emote.name] = {
                        url: `${baseUrl}/2x.webp`,
                        previewUrl: `${baseUrl}/3x.webp`,
                        baseUrl: baseUrl,
                        animated: emote.data.animated || false,
                        id: emote.id,
                        creator: emote.data?.owner?.display_name || emote.data?.owner?.username || "Unknown"
                    };
                }
            }

            this.emotesLoaded = true;

            // Pre-compute all caches for performance
            this.buildCaches();

            this.log(`Loaded ${Object.keys(this.emoteMap).length} emotes`);

            return this.emoteMap;
        } catch (error) {
            console.error(`[${this.name}] Failed to load emotes:`, error);
            throw error;
        }
    }

    buildCaches() {
        const names = Object.keys(this.emoteMap);

        // Pre-compute IDs set for O(1) lookup
        this.sevenTVIds = new Set(Object.values(this.emoteMap).map(e => e.id));

        // Pre-compute lowercase names map for fast case-insensitive search
        this.emoteNamesLower = new Map();
        names.forEach(name => {
            this.emoteNamesLower.set(name.toLowerCase(), name);
        });

        // Pre-sort names alphabetically
        this.emoteNamesSorted = names.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        // Pre-compute search index for faster autocomplete
        this.searchIndex = new Map();
        names.forEach(name => {
            const lower = name.toLowerCase();
            // Index by each starting position
            for (let i = 0; i < Math.min(lower.length, 3); i++) {
                const prefix = lower.slice(0, i + 1);
                if (!this.searchIndex.has(prefix)) {
                    this.searchIndex.set(prefix, []);
                }
                this.searchIndex.get(prefix).push(name);
            }
        });

        this.log('Caches built');
    }

    injectStyles() {
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

        this.styleElement = document.createElement("style");
        this.styleElement.id = "x7tv-emotes-styles";
        this.styleElement.textContent = css;
        document.head.appendChild(this.styleElement);

        // Dynamic style for Discord emote resizing
        this.discordEmoteStyleElement = document.createElement("style");
        this.discordEmoteStyleElement.id = "x7tv-discord-emote-styles";
        document.head.appendChild(this.discordEmoteStyleElement);
        this.updateDiscordEmoteStyles();
    }

    updateDiscordEmoteStyles() {
        if (!this.discordEmoteStyleElement) return;

        if (this.settings?.resizeDiscordEmotes) {
            const size = this.settings.emoteSize;
            this.discordEmoteStyleElement.textContent = `
                /* Resize Discord emotes to match 7TV emote size - only in messages, not editor */
                [class*="messageContent"] .emoji[data-type="emoji"],
                [class*="messageContent"] img.emoji {
                    height: ${size}px !important;
                    width: auto !important;
                    vertical-align: middle !important;
                }
            `;
        } else {
            this.discordEmoteStyleElement.textContent = '';
        }
    }

    removeStyles() {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
        if (this.discordEmoteStyleElement) {
            this.discordEmoteStyleElement.remove();
            this.discordEmoteStyleElement = null;
        }
    }

    setupObserver() {
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                // Handle new nodes
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.processNode(node);
                    }
                }

                // Handle edited messages (content changed in already-processed element)
                if (mutation.type === "childList" && mutation.target.matches?.('[class*="messageContent"]')) {
                    delete mutation.target.dataset.x7tvProcessed;
                    this.processMessageContent(mutation.target);
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.log("Observer setup complete");
    }

    removeObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }

    processExistingMessages() {
        if (!this.emotesLoaded) return;

        const messageContents = document.querySelectorAll('[class*="messageContent"]');
        messageContents.forEach(content => this.processMessageContent(content));

        this.log(`Processed ${messageContents.length} existing messages`);
    }

    processNode(node) {
        if (!this.emotesLoaded) return;

        if (node.matches && node.matches('[class*="messageContent"]')) {
            this.processMessageContent(node);
        }

        const messageContents = node.querySelectorAll?.('[class*="messageContent"]');
        if (messageContents) {
            messageContents.forEach(content => this.processMessageContent(content));
        }
    }

    processMessageContent(element) {
        if (!element || element.dataset.x7tvProcessed) return;
        element.dataset.x7tvProcessed = "true";

        this.processTextNodes(element);
    }

    processTextNodes(element) {
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
            this.processTextNode(textNode);
        }
    }

    processTextNode(textNode) {
        const text = textNode.textContent;
        if (!text || !text.trim()) return;

        // Skip syntax-highlighted code blocks (they flicker due to Discord's re-rendering)
        if (textNode.parentElement?.closest('[class*="hljs"]')) return;

        const size = this.settings.emoteSize;
        const mode = this.settings.matchMode;
        const showTooltips = this.settings.showTooltips;

        // Use cached pattern or build it
        if (!this.matchPattern || this.matchPatternMode !== mode) {
            const emoteNames = Object.keys(this.emoteMap)
                .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|");

            if (!emoteNames) return;

            switch (mode) {
                case "colon":
                    this.matchPattern = new RegExp(`:(?:${emoteNames}):`, "g");
                    break;
                case "insensitive":
                    this.matchPattern = new RegExp(`(?:^|\\s)(${emoteNames})(?=\\s|$)`, "gi");
                    break;
                default:
                    this.matchPattern = new RegExp(`(?:^|\\s)(${emoteNames})(?=\\s|$)`, "g");
            }
            this.matchPatternMode = mode;
        }

        // Reset lastIndex for reuse
        this.matchPattern.lastIndex = 0;
        const pattern = this.matchPattern;

        const matches = [];
        let match;

        while ((match = pattern.exec(text)) !== null) {
            matches.push({
                index: match.index,
                length: match[0].length,
                fullMatch: match[0],
                emoteName: mode === "colon" ? match[0].slice(1, -1) : match[1] || match[0].trim()
            });
        }

        if (matches.length === 0) return;

        const fragment = document.createDocumentFragment();
        let lastIndex = 0;

        for (const matchInfo of matches) {
            let emoteName = matchInfo.emoteName;
            let emote = this.emoteMap[emoteName];

            if (!emote && mode === "insensitive") {
                const lowerName = emoteName.toLowerCase();
                for (const [name, data] of Object.entries(this.emoteMap)) {
                    if (name.toLowerCase() === lowerName) {
                        emote = data;
                        emoteName = name;
                        break;
                    }
                }
            }

            if (!emote) continue;

            if (matchInfo.index > lastIndex) {
                fragment.appendChild(
                    document.createTextNode(text.slice(lastIndex, matchInfo.index))
                );
            }

            const leadingSpace = matchInfo.fullMatch.match(/^\s+/);
            if (leadingSpace) {
                fragment.appendChild(document.createTextNode(leadingSpace[0]));
            }

            const emoteElement = this.createEmoteElement(emoteName, emote, size, showTooltips);
            fragment.appendChild(emoteElement);

            lastIndex = matchInfo.index + matchInfo.length;
        }

        if (lastIndex < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
        }

        textNode.parentNode.replaceChild(fragment, textNode);
    }

    createEmoteElement(name, emote, size, showTooltips) {
        const container = document.createElement("span");
        container.className = "x7tv-emote-container";

        const img = document.createElement("img");
        img.src = emote.url;
        img.alt = name;
        img.className = "x7tv-emote";
        img.style.height = `${size}px`;
        img.style.width = "auto";
        img.draggable = false;

        if (showTooltips) {
            img.addEventListener("mouseenter", (e) => this.showTooltip(e, name, emote));
            img.addEventListener("mouseleave", () => this.hideTooltip());
        }

        img.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showEmoteContextMenu(e, name, emote);
        });

        container.appendChild(img);
        return container;
    }

    showTooltip(event, emoteName, emote) {
        this.hideTooltip();

        const tooltip = document.createElement("div");
        tooltip.className = "x7tv-tooltip";
        tooltip.id = "x7tv-tooltip";
        tooltip.style.visibility = "hidden";

        // Preview image - use 4x for large sizes
        const hoverSize = this.settings.hoverEmoteSize;
        const preview = document.createElement("img");
        preview.className = "x7tv-tooltip-preview";
        preview.src = `${emote.baseUrl}/4x.webp`;
        preview.alt = emoteName;
        preview.style.maxWidth = `${hoverSize}px`;
        preview.style.maxHeight = `${hoverSize}px`;
        tooltip.appendChild(preview);

        // Emote name
        const nameEl = document.createElement("div");
        nameEl.className = "x7tv-tooltip-name";
        nameEl.textContent = emoteName;
        tooltip.appendChild(nameEl);

        // Creator
        const creatorEl = document.createElement("div");
        creatorEl.className = "x7tv-tooltip-creator";
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

    hideTooltip() {
        const existing = document.getElementById("x7tv-tooltip");
        if (existing) existing.remove();
    }

    showEmoteContextMenu(event, emoteName, emote) {
        const sevenTvUrl = `https://old.7tv.app/emotes/${emote.id}`;
        const url1x = `${emote.baseUrl}/1x.webp`;
        const url2x = `${emote.baseUrl}/2x.webp`;
        const url4x = `${emote.baseUrl}/4x.webp`;

        BdApi.ContextMenu.open(event, BdApi.ContextMenu.buildMenu([
            {
                type: "submenu",
                label: "Open",
                id: "x7tv-open",
                items: [
                    {
                        type: "text",
                        id: "x7tv-open-7tv",
                        label: "7TV Page",
                        action: () => window.open(sevenTvUrl, "_blank")
                    },
                    { type: "separator", id: "x7tv-open-sep" },
                    {
                        type: "text",
                        id: "x7tv-open-1x",
                        label: "1x Image",
                        action: () => window.open(url1x, "_blank")
                    },
                    {
                        type: "text",
                        id: "x7tv-open-2x",
                        label: "2x Image",
                        action: () => window.open(url2x, "_blank")
                    },
                    {
                        type: "text",
                        id: "x7tv-open-4x",
                        label: "4x Image",
                        action: () => window.open(url4x, "_blank")
                    }
                ]
            },
            {
                type: "submenu",
                label: "Copy Link",
                id: "x7tv-copy",
                items: [
                    {
                        type: "text",
                        id: "x7tv-copy-7tv",
                        label: "7TV Page",
                        action: () => {
                            navigator.clipboard.writeText(sevenTvUrl);
                            BdApi.UI.showToast("Copied 7TV link!", { type: "success" });
                        }
                    },
                    { type: "separator", id: "x7tv-copy-sep" },
                    {
                        type: "text",
                        id: "x7tv-copy-1x",
                        label: "1x Image",
                        action: () => {
                            navigator.clipboard.writeText(url1x);
                            BdApi.UI.showToast("Copied 1x link!", { type: "success" });
                        }
                    },
                    {
                        type: "text",
                        id: "x7tv-copy-2x",
                        label: "2x Image",
                        action: () => {
                            navigator.clipboard.writeText(url2x);
                            BdApi.UI.showToast("Copied 2x link!", { type: "success" });
                        }
                    },
                    {
                        type: "text",
                        id: "x7tv-copy-4x",
                        label: "4x Image",
                        action: () => {
                            navigator.clipboard.writeText(url4x);
                            BdApi.UI.showToast("Copied 4x link!", { type: "success" });
                        }
                    }
                ]
            }
        ]));
    }

    cleanupEmotes() {
        document.querySelectorAll('[data-x7tv-processed]').forEach(el => {
            delete el.dataset.x7tvProcessed;
        });

        document.querySelectorAll('.x7tv-emote-container').forEach(el => {
            const text = el.querySelector('img')?.alt || '';
            const textNode = document.createTextNode(text);
            el.parentNode?.replaceChild(textNode, el);
        });

        this.hideTooltip();
    }

    // ============ EMOTE PICKER ============

    setupPickerButton() {
        this.pickerButtonObserver = new MutationObserver(() => {
            this.injectPickerButton();
        });

        this.pickerButtonObserver.observe(document.body, {
            childList: true,
            subtree: true
        });

        this.injectPickerButton();
    }

    removePickerButton() {
        if (this.pickerButtonObserver) {
            this.pickerButtonObserver.disconnect();
            this.pickerButtonObserver = null;
        }
        document.querySelectorAll('.x7tv-picker-btn').forEach(el => el.remove());
    }

    injectPickerButton() {
        // Try multiple selectors for the emoji button
        const emojiButtons = document.querySelectorAll('[aria-label="Select emoji"], [aria-label="Open emoji picker"], [class*="emojiButton"], [class*="emoji"][class*="Button"]');

        emojiButtons.forEach(emojiButton => {
            // Check if we already added our button near this one
            const parent = emojiButton.parentElement;
            if (!parent || parent.querySelector('.x7tv-picker-btn')) return;

            const btn = document.createElement('button');
            btn.className = 'x7tv-picker-btn';
            btn.type = 'button';
            btn.setAttribute('aria-label', '7TV Emotes');
            btn.innerHTML = this.get7TVLogo();

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.togglePicker(btn);
            });

            // Insert before the emoji button
            parent.insertBefore(btn, emojiButton);
            this.log('Injected picker button');
        });
    }

    get7TVLogo() {
        return `<svg width="24" height="24" viewBox="0 0 28 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.7465 5.48825L21.9799 3.33745L22.646 2.20024L21.4125 0.0494437V0H14.8259L17.2928 4.3016L17.9836 5.48825H20.7465Z"></path>
            <path d="M7.15395 19.9258L14.5546 7.02104L15.4673 5.43884L13.0004 1.13724L12.3097 0.0247596H1.8995L0.666057 2.17556L0 3.31276L1.23344 5.46356V5.51301H9.12745L2.96025 16.267L2.09685 17.7998L3.33029 19.9506V20H7.15395"></path>
            <path d="M17.4655 19.9257H21.2398L26.1736 11.3225L27.037 9.83924L25.8036 7.68844V7.63899H22.0046L19.5377 11.9406L19.365 12.262L16.8981 7.96038L16.7255 7.63899L14.2586 11.9406L13.5679 13.1272L17.2682 19.5796L17.4655 19.9257Z"></path>
        </svg>`;
    }

    getRandomEmote() {
        const emoteNames = Object.keys(this.emoteMap);
        if (emoteNames.length === 0) return null;
        const randomName = emoteNames[Math.floor(Math.random() * emoteNames.length)];
        return { name: randomName, ...this.emoteMap[randomName] };
    }

    togglePicker(buttonEl) {
        if (this.pickerOpen) {
            this.closePicker();
        } else {
            this.openPicker(buttonEl);
        }
    }

    openPicker(buttonEl) {
        this.closePicker();
        this.pickerOpen = true;

        const picker = document.createElement('div');
        picker.className = 'x7tv-picker';
        picker.id = 'x7tv-picker';

        // Header with search
        const header = document.createElement('div');
        header.className = 'x7tv-picker-header';

        const search = document.createElement('input');
        search.className = 'x7tv-picker-search';
        search.type = 'text';
        search.placeholder = 'Search emotes...';

        // Debounced search for performance
        let searchTimeout = null;
        search.addEventListener('input', () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filterPickerEmotes(search.value);
            }, 50); // 50ms debounce
        });
        header.appendChild(search);
        picker.appendChild(header);

        // Emote grid
        const grid = document.createElement('div');
        grid.className = 'x7tv-picker-grid';
        grid.id = 'x7tv-picker-grid';
        this.populatePickerGrid(grid, '');
        picker.appendChild(grid);

        // Footer (shows hovered emote info)
        const footer = document.createElement('div');
        footer.className = 'x7tv-picker-footer';
        footer.id = 'x7tv-picker-footer';
        footer.innerHTML = '<span style="color: var(--text-muted)">Hover over an emote</span>';
        picker.appendChild(footer);

        // Position relative to button
        const buttonRect = buttonEl.getBoundingClientRect();
        const formContainer = buttonEl.closest('[class*="form_"]') || buttonEl.closest('[class*="channelTextArea_"]');

        if (formContainer) {
            formContainer.style.position = 'relative';
            formContainer.appendChild(picker);
        } else {
            document.body.appendChild(picker);
            picker.style.position = 'fixed';
            picker.style.bottom = `${window.innerHeight - buttonRect.top + 8}px`;
            picker.style.right = `${window.innerWidth - buttonRect.right}px`;
        }

        // Focus search
        setTimeout(() => search.focus(), 0);

        // Close on outside click
        this.pickerClickHandler = (e) => {
            if (!picker.contains(e.target) && !buttonEl.contains(e.target)) {
                this.closePicker();
            }
        };
        document.addEventListener('click', this.pickerClickHandler);
    }

    closePicker() {
        this.pickerOpen = false;
        const picker = document.getElementById('x7tv-picker');
        if (picker) picker.remove();

        if (this.pickerClickHandler) {
            document.removeEventListener('click', this.pickerClickHandler);
            this.pickerClickHandler = null;
        }
    }

    populatePickerGrid(grid, filter) {
        grid.innerHTML = '';

        const filterLower = filter.toLowerCase();

        // Use pre-sorted names or search index for performance
        let emoteNames;
        if (filter) {
            // Use search index for faster lookup
            const prefix = filterLower.slice(0, Math.min(filterLower.length, 3));
            let candidates = this.searchIndex?.get(prefix) || this.emoteNamesSorted || Object.keys(this.emoteMap);

            // Filter and sort by relevance
            emoteNames = candidates
                .filter(name => name.toLowerCase().includes(filterLower))
                .sort((a, b) => {
                    const aLower = a.toLowerCase();
                    const bLower = b.toLowerCase();

                    // Exact match first
                    if (aLower === filterLower) return -1;
                    if (bLower === filterLower) return 1;

                    // Starts with filter second
                    const aStarts = aLower.startsWith(filterLower);
                    const bStarts = bLower.startsWith(filterLower);
                    if (aStarts && !bStarts) return -1;
                    if (bStarts && !aStarts) return 1;

                    // Earlier position in string third
                    const aIndex = aLower.indexOf(filterLower);
                    const bIndex = bLower.indexOf(filterLower);
                    if (aIndex !== bIndex) return aIndex - bIndex;

                    // Alphabetical as tiebreaker
                    return aLower.localeCompare(bLower);
                });
        } else {
            // Use pre-sorted list
            emoteNames = this.emoteNamesSorted || Object.keys(this.emoteMap);
        }

        if (emoteNames.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'x7tv-picker-empty';
            empty.textContent = filter ? 'No emotes found' : 'No emotes loaded';
            grid.appendChild(empty);
            return;
        }

        const pickerSize = this.settings.pickerEmoteSize;

        emoteNames.forEach(name => {
            const emote = this.emoteMap[name];
            const emoteEl = document.createElement('div');
            emoteEl.className = 'x7tv-picker-emote';
            emoteEl.style.height = `${pickerSize + 8}px`;
            emoteEl.style.minWidth = `${pickerSize + 8}px`;

            const img = document.createElement('img');
            img.src = emote.url;
            img.alt = name;
            img.loading = 'lazy';
            img.style.maxHeight = `${pickerSize}px`;
            emoteEl.appendChild(img);

            emoteEl.addEventListener('mouseenter', () => {
                this.updatePickerFooter(name, emote);
            });

            emoteEl.addEventListener('click', () => {
                this.insertEmote(name);
                this.closePicker();
            });

            grid.appendChild(emoteEl);
        });
    }

    filterPickerEmotes(filter) {
        const grid = document.getElementById('x7tv-picker-grid');
        if (grid) {
            this.populatePickerGrid(grid, filter);
        }
    }

    updatePickerFooter(name, emote) {
        const footer = document.getElementById('x7tv-picker-footer');
        if (!footer) return;

        footer.innerHTML = '';

        const img = document.createElement('img');
        img.src = emote.url;
        img.alt = name;
        footer.appendChild(img);

        const info = document.createElement('div');

        const nameEl = document.createElement('div');
        nameEl.className = 'x7tv-picker-footer-name';
        nameEl.textContent = name;
        info.appendChild(nameEl);

        const creatorEl = document.createElement('div');
        creatorEl.className = 'x7tv-picker-footer-creator';
        creatorEl.textContent = `by ${emote.creator}`;
        info.appendChild(creatorEl);

        footer.appendChild(info);
    }

    insertEmote(emoteName) {
        const textToInsert = emoteName + ' ';

        // Method 1: Try ComponentDispatch
        const ComponentDispatch = BdApi.Webpack.getModule(m => m.dispatchToLastSubscribed && m.emitter, { searchExports: true });
        if (ComponentDispatch) {
            ComponentDispatch.dispatchToLastSubscribed("INSERT_TEXT", { plainText: textToInsert });
            this.log("Inserted via ComponentDispatch");
            return;
        }

        // Method 2: Try finding the text area utilities
        const TextAreaUtils = BdApi.Webpack.getModule(m => m.insertText && m.focus, { searchExports: true });
        if (TextAreaUtils) {
            TextAreaUtils.insertText(textToInsert);
            this.log("Inserted via TextAreaUtils");
            return;
        }

        // Method 3: Direct DOM manipulation with input simulation
        const editor = document.querySelector('[data-slate-editor="true"]');
        if (editor) {
            editor.focus();

            // Get the selection
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                const textNode = document.createTextNode(textToInsert);
                range.insertNode(textNode);
                range.setStartAfter(textNode);
                range.setEndAfter(textNode);
                selection.removeAllRanges();
                selection.addRange(range);

                // Trigger input event
                editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: textToInsert }));
                this.log("Inserted via DOM manipulation");
                return;
            }
        }

        // Method 4: Fallback - show toast with emote name to copy
        BdApi.UI.showToast(`Copy: ${emoteName}`, { type: "info" });
    }

    // ============ AUTOCOMPLETE ============

    setupAutocomplete() {
        this.patchEmojiSearch();
        this.log('Autocomplete setup complete');
    }

    removeAutocomplete() {
        // Unpatch all patches
        BdApi.Patcher.unpatchAll(this.name);
    }

    patchMessageSend() {
        const self = this;

        // Find the message sending module
        const MessageActions = BdApi.Webpack.getModule(m => m?.sendMessage && m?.editMessage);

        if (MessageActions?.sendMessage) {
            this.log('Found MessageActions.sendMessage, patching...');
            BdApi.Patcher.before(this.name, MessageActions, 'sendMessage', (_, args) => {
                // args[1] is the message object with content
                if (args[1]?.content) {
                    const original = args[1].content;
                    let modified = original;

                    // First: Replace <:EmoteName:id> or <a:EmoteName:id> (Discord emoji format)
                    modified = modified.replace(/<a?:([^:]+):(\d+)>/g, (match, emoteName, emojiId) => {
                        if (self.emoteMap[emoteName]) {
                            self.log(`Converting ${match} to ${emoteName}`);
                            return emoteName;
                        }
                        return match;
                    });

                    // Second: Replace :EmoteName: (raw colon format for 7TV-only emotes)
                    modified = modified.replace(/:([^:\s]+):/g, (match, emoteName) => {
                        if (self.emoteMap[emoteName]) {
                            self.log(`Converting ${match} to ${emoteName}`);
                            return emoteName;
                        }
                        return match;
                    });

                    if (modified !== original) {
                        args[1].content = modified;
                        self.log('Message modified:', original, '->', args[1].content);
                    }
                }

                // Remove 7TV emotes from invalidEmojis (prevents "emoji from different server" error)
                if (args[1]?.invalidEmojis?.length > 0) {
                    args[1].invalidEmojis = args[1].invalidEmojis.filter(e => !self.emoteMap[e?.name]);
                }

                // Remove 7TV emojis from validNonShortcutEmojis
                if (args[1]?.validNonShortcutEmojis?.length > 0) {
                    args[1].validNonShortcutEmojis = args[1].validNonShortcutEmojis.filter(e => !self.emoteMap[e?.name]);
                }
            });
        } else {
            this.log('Could not find MessageActions.sendMessage');
        }
    }

    patchEmojiSearch() {
        const self = this;
        let foundSearch = false;

        // Patch message sending to convert :EmoteName: to just EmoteName for 7TV emotes
        this.patchMessageSend();

        // Method 1: Try to find and patch the emoji search module
        const EmojiSearch = BdApi.Webpack.getModule(m => m?.searchWithoutFetchingLatest);

        if (EmojiSearch?.searchWithoutFetchingLatest) {
            this.log('Found EmojiSearch.searchWithoutFetchingLatest, patching...');
            BdApi.Patcher.after(this.name, EmojiSearch, 'searchWithoutFetchingLatest', (_, args, ret) => {
                return self.injectIntoEmojiResults(args[0]?.query, ret);
            });
            foundSearch = true;
        }

        // Method 2: Try to find emoji search by different keys
        if (!foundSearch) {
            const EmojiSearch2 = BdApi.Webpack.getModule(m => m?.search && m?.getDisambiguatedEmojiContext);

            if (EmojiSearch2?.search) {
                this.log('Found EmojiSearch.search, patching...');
                BdApi.Patcher.after(this.name, EmojiSearch2, 'search', (_, args, ret) => {
                    return self.injectIntoEmojiResults(args[0]?.query || args[0], ret);
                });
                foundSearch = true;
            }
        }

        // Method 3: Find by searching exports
        if (!foundSearch) {
            const [EmojiModule, searchKey] = BdApi.Webpack.getWithKey(
                m => typeof m === 'function' && m.toString?.().includes('frecencyWithoutFetchingLatest'),
                { searchExports: true }
            ) || [];

            if (EmojiModule && searchKey) {
                this.log(`Found emoji search module with key: ${searchKey}, patching...`);
                BdApi.Patcher.after(this.name, EmojiModule, searchKey, (_, args, ret) => {
                    return self.injectIntoEmojiResults(args[0]?.query || args[0], ret);
                });
                foundSearch = true;
            }
        }

        if (!foundSearch) {
            this.log('Could not find emoji search module, autocomplete will not work');
        }

        // Patch the emoji URL resolver
        this.patchEmojiURL();

        // Patch the emoji insertion to handle 7TV emotes
        this.patchEmojiInsertion();
    }

    patchEmojiURL() {
        const self = this;

        // Find the emoji URL utilities
        const EmojiUtils = BdApi.Webpack.getModule(m => m?.getEmojiURL || m?.getURL);

        if (EmojiUtils?.getEmojiURL) {
            this.log('Found EmojiUtils.getEmojiURL, patching...');
            BdApi.Patcher.instead(this.name, EmojiUtils, 'getEmojiURL', (_, args, original) => {
                const emoji = args[0];
                if (emoji?.is7TV && emoji?.url) {
                    return emoji.url;
                }
                return original(...args);
            });
        }

        // Also try getURL
        if (EmojiUtils?.getURL) {
            this.log('Found EmojiUtils.getURL, patching...');
            BdApi.Patcher.instead(this.name, EmojiUtils, 'getURL', (_, args, original) => {
                const emoji = args[0];
                if (emoji?.is7TV && emoji?.url) {
                    return emoji.url;
                }
                return original(...args);
            });
        }

        // Try finding by string in toString
        const [UrlModule, urlKey] = BdApi.Webpack.getWithKey(
            m => typeof m === 'function' && m.toString?.().includes('cdn.discordapp.com/emojis'),
            { searchExports: true }
        ) || [];

        if (UrlModule && urlKey) {
            this.log(`Found emoji URL function with key: ${urlKey}, patching...`);
            BdApi.Patcher.instead(this.name, UrlModule, urlKey, (_, args, original) => {
                const emoji = args[0];
                if (emoji?.is7TV && emoji?.url) {
                    return emoji.url;
                }
                return original(...args);
            });
        }
    }

    patchEmojiInsertion() {
        const self = this;

        // Find the module that handles inserting emojis into the text
        const InsertModule = BdApi.Webpack.getModule(m => m?.insertEmoji);

        if (InsertModule?.insertEmoji) {
            this.log('Found InsertModule.insertEmoji, patching...');
            BdApi.Patcher.instead(this.name, InsertModule, 'insertEmoji', (_, args, original) => {
                const emoji = args[0];

                // Check if it's a 7TV emoji
                if (emoji?.is7TV) {
                    self.log('Inserting 7TV emote:', emoji.name);
                    self.insertEmote(emoji.name);
                    return;
                }

                // Otherwise call original
                return original(...args);
            });
            return;
        }

        // Try finding by different method
        const InsertModule2 = BdApi.Webpack.getModule(m => m?.default?.insertEmoji);

        if (InsertModule2?.default?.insertEmoji) {
            this.log('Found InsertModule2.default.insertEmoji, patching...');
            BdApi.Patcher.instead(this.name, InsertModule2.default, 'insertEmoji', (_, args, original) => {
                const emoji = args[0];

                if (emoji?.is7TV) {
                    self.log('Inserting 7TV emote:', emoji.name);
                    self.insertEmote(emoji.name);
                    return;
                }

                return original(...args);
            });
            return;
        }

        // Method 3: Find ComponentDispatch and intercept INSERT_TEXT for emojis
        const ComponentDispatch = BdApi.Webpack.getModule(m => m.dispatchToLastSubscribed && m.emitter, { searchExports: true });

        if (ComponentDispatch) {
            this.log('Setting up ComponentDispatch listener for emoji insertion');

            // We'll handle this differently - patch the autocomplete selection
            this.patchAutocompleteSelection();
            return;
        }

        this.log('Could not find emoji insertion module');
    }

    patchAutocompleteSelection() {
        // Inline emote preview would require hooking into Slate's API properly
        // which is too complex and fragile. Instead, we just let the user type
        // :emoteName: and convert it on send via patchMessageSend()
    }

    injectIntoEmojiResults(query, results) {
        if (!query || query.length < 1 || !results) return results;

        const queryLower = query.toLowerCase();

        // Use search index for faster lookup
        let candidates;
        const prefix = queryLower.slice(0, Math.min(queryLower.length, 3));
        if (this.searchIndex?.has(prefix)) {
            candidates = this.searchIndex.get(prefix);
        } else {
            candidates = this.emoteNamesSorted || Object.keys(this.emoteMap);
        }

        const matches = candidates
            .filter(name => name.toLowerCase().includes(queryLower))
            .sort((a, b) => {
                const aLower = a.toLowerCase();
                const bLower = b.toLowerCase();
                if (aLower === queryLower) return -1;
                if (bLower === queryLower) return 1;
                const aStarts = aLower.startsWith(queryLower);
                const bStarts = bLower.startsWith(queryLower);
                if (aStarts && !bStarts) return -1;
                if (bStarts && !aStarts) return 1;
                return aLower.localeCompare(bLower);
            })
            .slice(0, 5);

        if (matches.length === 0) return results;

        // Create fake emoji objects that look like unicode emojis (so Discord inserts text, not <:name:id>)
        const sevenTVEmojis = matches.map(name => {
            const emote = this.emoteMap[name];
            const emojiUrl = emote.url;
            const textToInsert = name + ' ';

            // Make it look like a unicode emoji - these get inserted as their surrogates value
            return {
                // NO id field - custom emojis have id, unicode don't
                name: name,
                names: [name],
                allNamesString: name, // No colons!
                // This is what gets inserted for unicode emojis!
                surrogates: textToInsert,
                // Explicitly no colons
                require_colons: false,
                requireColons: false,
                // Mark it as unicode-like
                type: 0, // 0 = unicode, 1 = custom
                // Diversity/skin tone stuff
                diversityChildren: null,
                hasDiversity: false,
                // Prevent it from being treated as custom
                managed: false,
                animated: false,
                // Custom flag for our rendering
                is7TV: true,
                _7tvUrl: emojiUrl,
                _7tvAnimated: emote.animated,
                // URL for rendering in autocomplete
                url: emojiUrl,
                src: emojiUrl,
                // Make getURL return our URL for autocomplete preview
                getURL() { return emojiUrl; },
                // Usability
                usable: true,
                available: true,
                // Override toString and other string methods
                toString() { return textToInsert; },
                valueOf() { return textToInsert; },
                // Override how it gets converted to message content
                get content() { return textToInsert; },
                get rawContent() { return textToInsert; }
            };
        });

        // Inject into results
        if (Array.isArray(results)) {
            return [...sevenTVEmojis, ...results];
        } else if (results?.unlocked) {
            // Results might be { unlocked: [], locked: [] }
            return {
                ...results,
                unlocked: [...sevenTVEmojis, ...(results.unlocked || [])]
            };
        } else if (results?.emojis) {
            return {
                ...results,
                emojis: [...sevenTVEmojis, ...(results.emojis || [])]
            };
        }

        return results;
    }

    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.className = "x7tv-settings";

        // Emote Set ID
        panel.appendChild(this.createTextSetting(
            "7TV Emote Set ID",
            "The ID of the 7TV emote set to use. Default is xQc's emote set.",
            "emoteSetId"
        ));

        // Emote Size
        panel.appendChild(this.createSliderSetting(
            "Emote Size",
            "Size of emotes in messages",
            "emoteSize",
            16, 128, "px",
            () => this.updateDiscordEmoteStyles()
        ));

        // Picker Emote Size
        panel.appendChild(this.createSliderSetting(
            "Picker Emote Size",
            "Size of emotes in the picker",
            "pickerEmoteSize",
            24, 64, "px"
        ));

        // Hover Emote Size
        panel.appendChild(this.createSliderSetting(
            "Hover Preview Size",
            "Size of emote preview when hovering",
            "hoverEmoteSize",
            64, 256, "px"
        ));

        // Match Mode
        panel.appendChild(this.createSelectSetting(
            "Match Mode",
            "How to match emote names in messages",
            "matchMode",
            [
                { label: "Exact word match", value: "word" },
                { label: "Case insensitive", value: "insensitive" },
                { label: "Wrapped in colons :emote:", value: "colon" }
            ]
        ));

        // Show Tooltips
        panel.appendChild(this.createSwitchSetting(
            "Show Tooltips",
            "Show emote name when hovering over emotes",
            "showTooltips"
        ));

        // Resize Discord Emotes
        panel.appendChild(this.createSwitchSetting(
            "Resize Discord Emotes",
            "Make Discord emotes the same size as 7TV emotes",
            "resizeDiscordEmotes",
            () => this.updateDiscordEmoteStyles()
        ));

        // Debug Mode
        panel.appendChild(this.createSwitchSetting(
            "Debug Mode",
            "Log debug information to console",
            "debugMode"
        ));

        // Reload button
        const reloadBtn = document.createElement("button");
        reloadBtn.className = "x7tv-button";
        reloadBtn.textContent = "Reload Emotes";
        reloadBtn.onclick = () => {
            this.loadEmotes().then(() => {
                BdApi.UI.showToast(`Loaded ${Object.keys(this.emoteMap).length} emotes!`, { type: "success" });
                this.cleanupEmotes();
                this.processExistingMessages();
                emoteCount.textContent = `Currently loaded: ${Object.keys(this.emoteMap).length} emotes`;
            }).catch(err => {
                BdApi.UI.showToast("Failed to reload emotes!", { type: "error" });
            });
        };
        panel.appendChild(reloadBtn);

        // Emote count
        const emoteCount = document.createElement("div");
        emoteCount.className = "x7tv-emote-count";
        emoteCount.textContent = `Currently loaded: ${Object.keys(this.emoteMap).length} emotes`;
        panel.appendChild(emoteCount);

        return panel;
    }

    createTextSetting(label, note, settingKey) {
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
        input.value = this.settings[settingKey];
        input.onchange = (e) => {
            this.settings[settingKey] = e.target.value;
            this.saveSettings();
        };
        group.appendChild(input);

        return group;
    }

    createSliderSetting(label, note, settingKey, min, max, units, onChange) {
        const group = document.createElement("div");
        group.className = "x7tv-setting-group";

        const labelEl = document.createElement("div");
        labelEl.className = "x7tv-setting-label";
        labelEl.textContent = `${label}: ${this.settings[settingKey]}${units}`;
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
        slider.value = this.settings[settingKey];
        slider.oninput = (e) => {
            const value = parseInt(e.target.value);
            this.settings[settingKey] = value;
            labelEl.textContent = `${label}: ${value}${units}`;
            this.saveSettings();
            if (onChange) onChange();
        };
        group.appendChild(slider);

        return group;
    }

    createSelectSetting(label, note, settingKey, options) {
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
            option.selected = this.settings[settingKey] === opt.value;
            select.appendChild(option);
        }

        select.onchange = (e) => {
            this.settings[settingKey] = e.target.value;
            this.saveSettings();
        };
        group.appendChild(select);

        return group;
    }

    createSwitchSetting(label, note, settingKey, onChange) {
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
        checkbox.checked = this.settings[settingKey];
        checkbox.onchange = (e) => {
            this.settings[settingKey] = e.target.checked;
            this.saveSettings();
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
};
