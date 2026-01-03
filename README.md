# xQc 7TV Emotes - BetterDiscord Plugin

Displays 7TV emotes from xQc's emote set (or any custom 7TV emote set) in Discord messages.

## Installation

1. Download `xQc7TVEmotes.plugin.js`
2. Open Discord and go to **User Settings > BetterDiscord > Plugins**
3. Click **Open Plugins Folder**
4. Copy the plugin file into the folder
5. Enable the plugin in BetterDiscord settings

## Features

- Fetches emotes from any 7TV emote set (default: xQc's set)
- Automatically replaces emote names in messages with images
- Animated emotes play automatically
- Configurable emote size (16px - 128px)
- Multiple match modes
- Click emotes to view on old.7tv.app
- Rich tooltips showing emote preview, name, and creator

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| **Emote Set ID** | The 7TV emote set ID to use | `01FE9DRF000009TR6M9N941CYW` (xQc's set) |
| **Emote Size** | Display size in pixels | 32px |
| **Match Mode** | How to match emote names | Exact word match |
| **Show Tooltips** | Show emote name on hover | Enabled |
| **Debug Mode** | Log debug info to console | Disabled |

### Match Modes

- **Exact word match**: Matches emote names as complete words (e.g., `OMEGALUL`)
- **Case insensitive**: Same as above but ignores case (e.g., `omegalul` matches `OMEGALUL`)
- **Wrapped in colons**: Only matches when wrapped in colons (e.g., `:OMEGALUL:`)

## Using Custom Emote Sets

To use a different 7TV emote set:

1. Go to [7tv.app](https://7tv.app) and find the emote set you want
2. Copy the emote set ID from the URL (e.g., `https://7tv.app/emote-sets/01FE9DRF000009TR6M9N941CYW`)
3. Paste the ID into the plugin settings

## API Reference

Emotes are fetched from:
```
https://api.7tv.app/v3/emote-sets/{EMOTE_SET_ID}
```

## Troubleshooting

### Emotes not showing

1. Check that the plugin is enabled
2. Verify the emote set ID is correct
3. Check browser console for errors (`Ctrl+Shift+I`)
4. Try clicking "Reload Emotes" in settings
5. Reload Discord (`Ctrl+R`)

### Emotes appear broken

- The 7TV API might be temporarily unavailable
- The emote may have been removed from the set
- Check your network connection

### Performance issues

- Reduce emote size in settings
- Disable "Show Tooltips" if not needed
- Consider using "Wrapped in colons" match mode (most performant)

## License

MIT
