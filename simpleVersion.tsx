/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 *
 * xQc 7TV Emotes - Simple Version
 * Place this file in: Vencord/src/userplugins/xqc7tvEmotes/index.tsx
 */

import { addPreSendListener, removePreSendListener } from "@api/MessageEvents";
import { definePluginSettings } from "@api/Settings";
import { Devs } from "@utils/constants";
import definePlugin, { OptionType } from "@utils/types";
import { findByPropsLazy } from "@webpack";
import { Parser, React } from "@webpack/common";
import type { Message } from "discord-types/general";

const EMOTE_SET_ID = "01FE9DRF000009TR6M9N941CYW";
const API_URL = `https://api.7tv.app/v3/emote-sets/${EMOTE_SET_ID}`;

interface EmoteData {
    url: string;
    animated: boolean;
}

interface EmoteMap {
    [name: string]: EmoteData;
}

let emoteMap: EmoteMap = {};
let emotesLoaded = false;
let emoteRegex: RegExp | null = null;

async function loadEmotes(): Promise<void> {
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        if (data.emotes) {
            emoteMap = {};
            for (const emote of data.emotes) {
                const hostUrl = emote.data?.host?.url;
                if (hostUrl) {
                    emoteMap[emote.name] = {
                        url: `https:${hostUrl}/2x.webp`,
                        animated: emote.data.animated
                    };
                }
            }

            // Build regex once
            const escaped = Object.keys(emoteMap)
                .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
                .join("|");
            emoteRegex = new RegExp(`(?<=^|\\s)(${escaped})(?=\\s|$)`, "g");

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
        description: "Emote size in pixels",
        default: 48,
        markers: [24, 32, 48, 64, 96, 128],
        stickToMarkers: false
    }
});

function renderEmote(name: string, url: string, size: number): JSX.Element {
    return (
        <img
            src={url}
            alt={name}
            title={name}
            className="xqc-7tv-emote"
            draggable={false}
            style={{
                height: `${size}px`,
                width: "auto",
                verticalAlign: "middle",
                margin: "0 1px",
                display: "inline",
                imageRendering: "auto"
            }}
        />
    );
}

export default definePlugin({
    name: "xQc7TVEmotes",
    description: "Shows 7TV emotes from xQc's emote set in chat messages",
    authors: [{ name: "You", id: 0n }],
    settings,

    patches: [
        // Patch the message content renderer
        {
            find: "roleMention",
            replacement: {
                match: /children:\[(\i)\]/,
                replace: "children:[$self.patchContent($1)]"
            }
        }
    ],

    patchContent(content: React.ReactNode): React.ReactNode {
        if (!emotesLoaded || !emoteRegex) return content;

        const size = settings.store.emoteSize;

        const transform = (node: React.ReactNode): React.ReactNode => {
            if (typeof node === "string") {
                const parts: React.ReactNode[] = [];
                let lastIdx = 0;
                let match;

                emoteRegex!.lastIndex = 0;
                while ((match = emoteRegex!.exec(node)) !== null) {
                    const emoteName = match[1];
                    const emote = emoteMap[emoteName];

                    if (emote) {
                        if (match.index > lastIdx) {
                            parts.push(node.slice(lastIdx, match.index));
                        }
                        parts.push(renderEmote(emoteName, emote.url, size));
                        lastIdx = emoteRegex!.lastIndex;
                    }
                }

                if (parts.length === 0) return node;
                if (lastIdx < node.length) parts.push(node.slice(lastIdx));

                return <>{parts}</>;
            }

            if (Array.isArray(node)) {
                return node.map((child, i) => <React.Fragment key={i}>{transform(child)}</React.Fragment>);
            }

            if (React.isValidElement(node) && node.props?.children) {
                return React.cloneElement(node, {}, transform(node.props.children));
            }

            return node;
        };

        return transform(content);
    },

    async start() {
        await loadEmotes();

        // Add custom CSS - ensure animations play automatically
        const style = document.createElement("style");
        style.id = "xqc-7tv-emotes-style";
        style.textContent = `
            .xqc-7tv-emote {
                object-fit: contain;
                pointer-events: auto;
                image-rendering: auto;
            }
        `;
        document.head.appendChild(style);
    },

    stop() {
        emoteMap = {};
        emotesLoaded = false;
        emoteRegex = null;
        document.getElementById("xqc-7tv-emotes-style")?.remove();
    }
});
