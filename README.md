
# Astro Twitch Clash: Game Design Document

## Deployment Note (Fly.io Volumes)

Runtime game/bot state can now be persisted on Fly.io volumes. See [VOLUME_MIGRATION.md](./VOLUME_MIGRATION.md) for setup and data migration steps.

## 1. Core Concept

Astro Twitch Clash is an interactive, browser-based game suite designed to foster a more engaging, interconnected, and community-driven experience for a group of Twitch streamers and their viewers. The application serves as a central hub where community members can participate in two main games, **Chat Tag** and **Chat Bingo**, that are played across multiple Twitch streams simultaneously.

The primary goal is to encourage viewers to explore other streamers within their community, create shared live experiences, and add a layer of friendly competition to their daily viewing habits.

---

## 2. The Data Flow: Defining the "Playground"

Your summary is correct. The entire game operates on a defined community of players, which we can call the "playground." Here’s how that playground is established and maintained:

1.  **Fetch the Source of Truth:** An administrator clicks the "Sync Community" button in the app's settings. This triggers a request to your external API endpoint. The primary responsibility of your server is to provide a complete list of all users who should be included in the game (e.g., all members of your Discord server).

2.  **Enrich with Twitch Data:** Your server should cross-reference this list with Twitch to get each user's current Twitch ID, username, avatar, and live status (`isActive`).

3.  **Save to the Database:** The "Astro Twitch Clash" app receives this final list of players and saves it to its own Firestore database (`/users/{userId}`). This local database now contains the official "playground" of users. All game logic (scoring, tagging, etc.) will run against this local data.

4.  **Periodic Refresh:** As you suggested, this process is not meant to be run constantly. It should be triggered periodically (e.g., once every 15-30 minutes, or manually by an admin) to refresh the list of players and, most importantly, update who is currently live (`isActive`). The "Astro Twitch Clash" app does **not** track live status in real-time; it relies on the data from the last successful sync.

---

## 3. Key Features & How They Drive Engagement

### a. Unified Community Hub
The app revolves around a single, unified "Community" of players defined by the sync process described above.

*   **How it works:** An admin syncs the member list. The app then populates its database with these verified community members. Only these players can participate in the games.
*   **Community-Driven Aspect:** This ensures the game is played among a known group of people, strengthening the bonds within that specific community. It creates a private playground.
*   **Live Status:** The hub displays which streamers in the community are currently live (based on the last sync), providing a centralized "who's on" dashboard and encouraging viewers to check out active streams.

### b. Game 1: Chat Tag
A perpetual game of tag played across Twitch chats.

*   **The "It" Mechanic:** One player in the community is designated as "It". Their status is clearly marked on their profile within the app.
*   **How to Tag:** The player who is "It" has the objective of tagging someone else. To do this, they must actively watch the streams of other live community members. If "It" sees another player from the game send a message in a streamer's chat, "It" can click the "Tag" button next to that player's name in the app.
*   **The Tag Event:**
    *   The tagging player ("It") earns points (e.g., +100).
    *   The tagged player loses points (e.g., -50) and becomes the new "It".
    *   **Crucial Engagement Loop:** A chat bot (listening to the `chatTags` collection in Firestore) announces the tag in the streamer's chat where it occurred (e.g., *"AstroBot: @PlayerA just tagged @PlayerB in this chat! @PlayerB is now It!"*). This makes the game visible and exciting for everyone watching.
*   **Community-Driven Aspect:** This game actively incentivizes viewers to visit and participate in the chats of *other* streamers within their community, breaking down viewership silos and promoting discovery.

### c. Game 2: Chat Bingo
A classic bingo game with a Twitch-centric twist.

*   **The Bingo Card:** Each player has a unique, randomly generated 5x5 bingo card. Each square contains a common Twitch phrase or event (e.g., "Clip it!", "Raid", "Technical Issues").
*   **How to Play:** When a player sees or hears one of the phrases/events on their card happen in a community member's stream, they can click that square. To prevent cheating, they must select *which* active streamer's chat the event occurred in. A single streamer can only be used to claim one square per "Bingo."
*   **Scoring:**
    *   Claiming a square awards points (e.g., +10).
    *   Achieving "Bingo" (a full row, column, or diagonal) awards a large point bonus (e.g., +250).
    *   Upon getting a Bingo, the board is automatically reset with a new set of phrases.
*   **Community-Driven Aspect:** Chat Bingo turns passive viewing into an active, attentive game. It creates a shared context for the entire community, where everyone is on the lookout for the same funny or common moments.

### d. Leaderboard & Points System
The leaderboard tracks the total score for all players, accumulated from both Chat Tag and Chat Bingo, fostering friendly competition.

---

## 4. External API Sync (Community Data Integration)

To connect this app to your existing community application, you can provide an HTTP endpoint on your server. When the "Sync Community" button is pressed on the settings page, this app will make a `POST` request to your specified URL to fetch the list of community members.

### Request from Astro Twitch Clash

Your server will receive a request with the following characteristics:

*   **Method:** `POST`
*   **Headers:**
    *   `Content-Type: application/json`
    *   `Accept: application/json`
*   **Body:** An empty JSON object (`{}`).

### Expected Response from Your Server

Your server must send back a response with the following structure:

*   **Status Code:** `200 OK`
*   **Headers:**
    *   `Content-Type: application/json`
*   **Body:** A JSON object containing a single key, `players`. The `players` key must be an array of objects, where each object represents one member of your community.

#### Player Object Structure

Each object inside the `players` array must have the following properties:

| Key              | Type      | Description                                               | Example                                                     |
| ---------------- | --------- | --------------------------------------------------------- | ----------------------------------------------------------- |
| `id`             | `string`  | The user's unique **Twitch User ID**.                     | `"12345678"`                                                |
| `twitchUsername` | `string`  | The user's current Twitch display name.                   | `"CoolStreamer"`                                            |
| `avatarUrl`      | `string`  | A direct URL to the user's profile picture.               | `"https://static-cdn.jtvnw.net/user-default-pictures/..."`  |
| `isActive`       | `boolean` | `true` if the user is currently streaming live, otherwise `false`. | `true`                                                      |
| `score`          | `number`  | (Optional) The user's external community points. This will be synced to the `communityPoints` field. | `1500` |


#### Example JSON Response Body

```json
{
  "players": [
    {
      "id": "98765432",
      "twitchUsername": "StreamerA",
      "avatarUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/some_url_a.png",
      "isActive": true,
      "score": 2500
    },
    {
      "id": "12345678",
      "twitchUsername": "ViewerB",
      "avatarUrl": "https://static-cdn.jtvnw.net/jtv_user_pictures/some_url_b.png",
      "isActive": false,
      "score": 750
    }
  ]
}
```

---

## 5. The Technical Vision (How It All Connects)

*   **Frontend:** A Next.js application where users log in with their Twitch account. This is the main interface for viewing the community list, playing the games, and seeing the leaderboard.
*   **Database (Firestore):**
    *   `/users/{userId}`: Stores player profiles, including their current score, Twitch username, avatar, and their `isIt` status for the tag game. This collection is populated by the "Sync Community" feature.
    *   `/gameSettings/default`: A single document for admins to configure point values and the external API URL.
    *   `/chatTags/{tagId}`: A new document is created here every time a tag occurs. A serverless function or bot listens to this collection to trigger the Twitch chat announcement.
    *   `/bingoEvents/{eventId}`: A new document is created for every Bingo win. This can be used by a Discord bot to announce winners.
*   **Authentication:** A Twitch OAuth flow allows users to sign in. The app uses Firebase Authentication to manage user sessions.
