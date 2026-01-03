/**
 * @name xQc7TVEmotes
 * @author valerie.sh
 * @description Displays 7TV emotes from xQc's emote set (or any custom 7TV emote set) in Discord messages
 * @version 1.0.0
 * @authorId 1312596471778115627
 * @source https://github.com/atvalerie/agiwtrebivhdvd
 * @updateUrl https://raw.githubusercontent.com/atvalerie/agiwtrebivhdvd/main/xQc7TVEmotes.plugin.js
 */

module.exports = class xQc7TVEmotes {
    constructor() {
        this.name = "xQc7TVEmotes";
        this.version = "1.0.0";
        this.author = "valerie.sh";
        this.description = "Displays 7TV emotes from any 7TV emote set in Discord messages";

        // Default settings
        this.defaultSettings = {
            emoteSetId: "01FE9DRF000009TR6M9N941CYW",
            emoteSize: 32,
            matchMode: "word",
            showTooltips: true,
            debugMode: false
        };

        this.settings = null;
        this.emoteMap = {};
        this.emotesLoaded = false;
        this.observer = null;
        this.styleElement = null;
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

        this.loadEmotes().then(() => {
            this.setupObserver();
            this.processExistingMessages();
            BdApi.UI.showToast(`Loaded ${Object.keys(this.emoteMap).length} emotes!`, { type: "success" });
        }).catch(err => {
            console.error(`[${this.name}]`, err);
            BdApi.UI.showToast("Failed to load emotes!", { type: "error" });
        });
    }

    stop() {
        this.log("Stopping plugin...");
        this.removeStyles();
        this.removeObserver();
        this.cleanupEmotes();
        this.emoteMap = {};
        this.emotesLoaded = false;
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
            this.log(`Loaded ${Object.keys(this.emoteMap).length} emotes`);

            return this.emoteMap;
        } catch (error) {
            console.error(`[${this.name}] Failed to load emotes:`, error);
            throw error;
        }
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
        `;

        this.styleElement = document.createElement("style");
        this.styleElement.id = "x7tv-emotes-styles";
        this.styleElement.textContent = css;
        document.head.appendChild(this.styleElement);
    }

    removeStyles() {
        if (this.styleElement) {
            this.styleElement.remove();
            this.styleElement = null;
        }
    }

    setupObserver() {
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        this.processNode(node);
                    }
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

        const size = this.settings.emoteSize;
        const mode = this.settings.matchMode;
        const showTooltips = this.settings.showTooltips;

        const emoteNames = Object.keys(this.emoteMap)
            .map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|");

        if (!emoteNames) return;

        let pattern;
        switch (mode) {
            case "colon":
                pattern = new RegExp(`:(?:${emoteNames}):`, "g");
                break;
            case "insensitive":
                pattern = new RegExp(`(?:^|\\s)(${emoteNames})(?=\\s|$)`, "gi");
                break;
            default:
                pattern = new RegExp(`(?:^|\\s)(${emoteNames})(?=\\s|$)`, "g");
        }

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

        // Preview image
        const preview = document.createElement("img");
        preview.className = "x7tv-tooltip-preview";
        preview.src = emote.previewUrl || emote.url;
        preview.alt = emoteName;
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
                type: "group",
                items: [
                    {
                        type: "submenu",
                        label: "Open",
                        items: [
                            {
                                type: "text",
                                label: "7TV Page",
                                action: () => window.open(sevenTvUrl, "_blank")
                            },
                            { type: "separator" },
                            {
                                type: "text",
                                label: "1x Image",
                                action: () => window.open(url1x, "_blank")
                            },
                            {
                                type: "text",
                                label: "2x Image",
                                action: () => window.open(url2x, "_blank")
                            },
                            {
                                type: "text",
                                label: "4x Image",
                                action: () => window.open(url4x, "_blank")
                            }
                        ]
                    },
                    {
                        type: "submenu",
                        label: "Copy Link",
                        items: [
                            {
                                type: "text",
                                label: "7TV Page",
                                action: () => {
                                    navigator.clipboard.writeText(sevenTvUrl);
                                    BdApi.UI.showToast("Copied 7TV link!", { type: "success" });
                                }
                            },
                            { type: "separator" },
                            {
                                type: "text",
                                label: "1x Image",
                                action: () => {
                                    navigator.clipboard.writeText(url1x);
                                    BdApi.UI.showToast("Copied 1x link!", { type: "success" });
                                }
                            },
                            {
                                type: "text",
                                label: "2x Image",
                                action: () => {
                                    navigator.clipboard.writeText(url2x);
                                    BdApi.UI.showToast("Copied 2x link!", { type: "success" });
                                }
                            },
                            {
                                type: "text",
                                label: "4x Image",
                                action: () => {
                                    navigator.clipboard.writeText(url4x);
                                    BdApi.UI.showToast("Copied 4x link!", { type: "success" });
                                }
                            }
                        ]
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
            "Size of emotes in pixels",
            "emoteSize",
            16, 128, "px"
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

    createSliderSetting(label, note, settingKey, min, max, units) {
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

    createSwitchSetting(label, note, settingKey) {
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
