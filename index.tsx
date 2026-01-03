/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addDecoration, removeDecoration } from "@api/MessageDecorations";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { React, useState, useEffect } from "@webpack/common";

const EMOTE_SET_ID = "01FE9DRF000009TR6M9N941CYW";
const API_URL = `https://api.7tv.app/v3/emote-sets/${EMOTE_SET_ID}`;

interface SevenTVEmote {
    id: string;
    name: string;
    data: {
        id: string;
        name: string;
        animated: boolean;
        host: {
            url: string;
            files: Array<{
                name: string;
                format: string;
            }>;
        };
    };
}

interface EmoteMap {
    [name: string]: {
        url: string;
        animated: boolean;
    };
}

let emoteMap: EmoteMap = {};
let emotesLoaded = false;

async function loadEmotes(): Promise<void> {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.emotes) {
            emoteMap = {};
            for (const emote of data.emotes as SevenTVEmote[]) {
                const hostUrl = emote.data?.host?.url;
                if (hostUrl) {
                    // Prefer webp 2x for good quality/size balance
                    const fileUrl = `https:${hostUrl}/2x.webp`;
                    emoteMap[emote.name] = {
                        url: fileUrl,
                        animated: emote.data.animated
                    };
                }
            }
            emotesLoaded = true;
            console.log(`[xQc7TVEmotes] Loaded ${Object.keys(emoteMap).length} emotes`);
        }
    } catch (error) {
        console.error("[xQc7TVEmotes] Failed to load emotes:", error);
    }
}

const settings = definePluginSettings({
    emoteSize: {
        type: OptionType.SLIDER,
        description: "Size of emotes in pixels",
        default: 32,
        markers: [16, 24, 32, 48, 64, 96, 128],
        stickToMarkers: false
    },
    replaceMode: {
        type: OptionType.SELECT,
        description: "How to match emote names",
        default: "word",
        options: [
            { label: "Exact word match", value: "word" },
            { label: "Case insensitive", value: "insensitive" },
            { label: "Wrapped in colons :emote:", value: "colon" }
        ]
    }
});

function EmoteComponent({ name, url, size, animated }: { name: string; url: string; size: number; animated: boolean }) {
    return (
        <img
            src={url}
            alt={name}
            title={name}
            draggable={false}
            style={{
                height: `${size}px`,
                width: "auto",
                verticalAlign: "middle",
                margin: "0 2px",
                display: "inline-block",
                imageRendering: "auto"
            }}
        />
    );
}

function processMessageContent(content: string): React.ReactNode[] {
    if (!emotesLoaded || !content) return [content];

    const size = settings.store.emoteSize;
    const mode = settings.store.replaceMode;
    const result: React.ReactNode[] = [];

    // Build regex pattern based on mode
    let pattern: RegExp;
    const emoteNames = Object.keys(emoteMap).map(name =>
        name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    ).join("|");

    if (!emoteNames) return [content];

    switch (mode) {
        case "colon":
            pattern = new RegExp(`:(?:${emoteNames}):`, "g");
            break;
        case "insensitive":
            pattern = new RegExp(`\\b(?:${emoteNames})\\b`, "gi");
            break;
        default: // word
            pattern = new RegExp(`\\b(?:${emoteNames})\\b`, "g");
    }

    let lastIndex = 0;
    let match;
    let keyCounter = 0;

    while ((match = pattern.exec(content)) !== null) {
        // Add text before the match
        if (match.index > lastIndex) {
            result.push(content.slice(lastIndex, match.index));
        }

        // Get emote name (strip colons if in colon mode)
        let emoteName = match[0];
        if (mode === "colon") {
            emoteName = emoteName.slice(1, -1);
        }

        // Find emote (case insensitive lookup if needed)
        let emote = emoteMap[emoteName];
        if (!emote && mode === "insensitive") {
            const lowerName = emoteName.toLowerCase();
            for (const [name, data] of Object.entries(emoteMap)) {
                if (name.toLowerCase() === lowerName) {
                    emote = data;
                    break;
                }
            }
        }

        if (emote) {
            result.push(
                <EmoteComponent
                    key={`emote-${keyCounter++}`}
                    name={emoteName}
                    url={emote.url}
                    size={size}
                    animated={emote.animated}
                />
            );
        } else {
            result.push(match[0]);
        }

        lastIndex = pattern.lastIndex;
    }

    // Add remaining text
    if (lastIndex < content.length) {
        result.push(content.slice(lastIndex));
    }

    return result.length > 0 ? result : [content];
}

export default definePlugin({
    name: "xQc7TVEmotes",
    description: "Replaces text matching 7TV emote names from xQc's emote set with actual emotes",
    authors: [Devs.Ven], // Replace with your name if contributing
    settings,

    patches: [
        {
            find: "messageContent,currentUserBoostedGuild",
            replacement: {
                match: /(\w+\.messageContent,\{[^}]*children:)(\w+)/,
                replace: "$1$self.processContent($2)"
            }
        }
    ],

    processContent(children: React.ReactNode): React.ReactNode {
        if (!emotesLoaded) return children;

        const processNode = (node: React.ReactNode): React.ReactNode => {
            if (typeof node === "string") {
                const processed = processMessageContent(node);
                if (processed.length === 1 && processed[0] === node) {
                    return node;
                }
                return <>{processed}</>;
            }

            if (Array.isArray(node)) {
                return node.map((child, i) => (
                    <React.Fragment key={i}>{processNode(child)}</React.Fragment>
                ));
            }

            if (React.isValidElement(node) && node.props?.children) {
                return React.cloneElement(
                    node,
                    node.props,
                    processNode(node.props.children)
                );
            }

            return node;
        };

        return processNode(children);
    },

    async start() {
        await loadEmotes();
    },

    stop() {
        emoteMap = {};
        emotesLoaded = false;
    }
});
