# Astro Twitch Clash - Backend TODO

This file outlines the backend tasks required to make the Astro Twitch Clash application fully functional with Twitch and Discord integrations.

### High Priority

-   [x] **Twitch User Authentication (OAuth2):**
    -   [x] Create a secure, server-side endpoint (e.g., a Next.js API route at `pages/api/auth/twitch.ts` or a separate Cloud Function).
    -   [x] This endpoint will receive the `code` from the frontend after a user authorizes the app on Twitch.
    -   [x] It will securely exchange the `code` (along with your `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`) for a user `access_token`.
    -   [x] Use the `access_token` to fetch the user's profile from the Twitch API (`/helix/users`).
    -   [x] Create a Firebase Custom Auth token for that user.
    -   [x] Return the Firebase Custom Auth token to the frontend, which will use it to sign in with `signInWithCustomToken`.

-   [ ] **Twitch Chat Bot Integration:**
    -   [ ] Create a bot service that listens to Firestore for new documents in the `/chatTags/{tagId}` collection.
    -   [ ] When a new tag event is created, the bot should connect to Twitch IRC.
    -   [ ] The bot will post a message to the chat of the streamer where the tag occurred (using the `streamerId` from the event). For example: `@tagger just tagged @tagged!`.
    -   [ ] This service will also need to read the `twitchBotToken` from the `/gameSettings/default` document or from a secure secret store.

### Low Priority

-   [ ] **Discord Bot Integration (Simple Events):**
    -   [ ] Create a bot service that listens to Firestore for new documents in `/chatTags/{tagId}` and `/bingoEvents/{eventId}`.
    -   [ ] When a new event occurs, the bot should post a nicely formatted embedded message to the Discord channel specified in `/gameSettings/default` (`discordChannelId`).
    -   [ ] This bot will need the `discordBotToken` from settings or a secret store.

-   [ ] **Game Promotion Bot (Twitch):**
    -   [ ] Create a service that listens for a trigger (e.g., a new document in a `/promotions` collection).
    -   [ ] When triggered, this bot will post a message in a specified Twitch chat with a link to the game's `/about` page.
    -   [ ] The frontend "Share in Chat" button in Settings will create the document that triggers this bot.

### Future Game Mechanic Ideas ("Hard Mode")

-   [ ] **Competitive Bingo Mode:**
    -   [ ] Squares are "owned" by the first player to claim them, blocking others.
    -   [ ] Implement a "steal" mechanic where another player can claim an owned square by getting the same phrase, changing its control.

-   [ ] **Community Point Multiplier:**
    -   [ ] The daily "bingo cards completed" count acts as a global point multiplier (e.g., 5 completed cards = 5x points for claims and wins).

-   [ ] **End-of-Card Scoring:**
    -   [ ] When a bingo card resets, players lose points based on how many squares they were short of a bingo, creating clearer 2nd, 3rd, etc. places.

-   [ ] **Dynamic Free Space:**
    -   [ ] The center "Free Space" is only free for players below a certain score threshold (e.g., 500 points).
    -   [ ] Higher-score players must set a custom phrase for their center square and achieve it themselves.

### Future Bot Enhancements

-   [ ] **Automatic Tag Clipping (Twitch & Discord):**
    -   [ ] When the bot announces a tag event in Twitch chat, it should also trigger the Twitch API to create a clip of the last 60 seconds of the stream.
    -   [ ] (Optional) Develop a process to download the clip, add sound effects or video filters ("TikTok style"), and create a compilation or "tag reel."
    -   [ ] Post the generated clip or enhanced video to the Discord webhook channel for everyone to see.

-   [ ] **Chat Command Onboarding:**
    -   [ ] The Twitch bot should listen for commands like `!tag` or `!bingo` in chat.
    -   [ ] When a command is used, the bot should send a whisper to the user with a link to the Astro Twitch Clash app to encourage them to sign up and play.
