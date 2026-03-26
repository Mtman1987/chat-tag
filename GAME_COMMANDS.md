# Chat Tag — Complete Command & Message Reference

## Player Commands
| Command | Description | Example Response |
|---------|-------------|-----------------|
| `@spmt join` | Join the game | `@User joined the tag game! 🎯 Type "@spmt join" to play too!` |
| `@spmt join @user` | Admin adds someone | `@TargetUser joined the tag game! 🎯 Type "@spmt join" to play too!` |
| `@spmt leave` | Leave the game | `@User left the tag game!` |
| `@spmt tag @user` | Tag someone (must be "it" or FFA) | `🎯 User tagged @target! @target is now it! Type "@spmt join" to play!` |
| `@spmt tag @user` | Tag during FFA (double points) | `🔥 User tagged @target for DOUBLE POINTS! @target is now it! 🔥 Type "@spmt join" to play!` |
| `@spmt pass @user` | Use earned pass (always double pts) | `🎟️ User used a PASS on @target for DOUBLE POINTS! @target is now it!` |
| `@spmt status` | Who's it? | `@User toxiktweet is it!` or `@User 🔥 FREE FOR ALL! Anyone can tag for DOUBLE POINTS! 🔥` |
| `@spmt score` | Your stats | `@User Rank: #3/82 \| Score: 450 pts \| Tags: 7 \| Tagged: 3` |
| `@spmt rank` | Top 3 leaderboard | `@User Top 3: #1 player1: 800 \| #2 player2: 650 \| #3 player3: 450` |
| `@spmt stats` | Tag counts | `@User Tags Made: 7 \| Times Tagged: 3` |
| `@spmt players` | Player list (active first) | `@User 82 players [🟢5 live, 💬12 chatting] (1/6): 🟢player1, 🟢player2, 💬player3...` |
| `@spmt more` | Next page of players | Same format, next page |
| `@spmt live` | Live players only | `@User Live now (1/2): player1, player2, player3...` |
| `@spmt sleep` | Go immune (away) | `@User is now away/sleeping 😴 (immune from tags)` |
| `@spmt wake` | Remove immunity | `@User is now awake! ☀️` |
| `@spmt rules` | Game rules | Tag rules explanation |
| `@spmt help` | All commands | Full command list |
| `@spmt info` | Game info | `Chat Tag game by SPMT! Join with @spmt join` |

## Bingo Commands
| Command | Description | Example Response |
|---------|-------------|-----------------|
| `@spmt card` | Show bingo grid (5 rows) | 5 messages, one per row: `[00Fi] [01Ch] [X02] [03Ra] [04Cl]` |
| `@spmt phrases` | Show full phrase text (paginated) | `@User Bingo (1/5): ⬜0: First donation \| ⬜1: Chat spams emotes \| ✅2: Technical difficulties...` |
| `@spmt claim 12` | Claim square 12 | `@User Claimed square 12!` or `@User Claimed square 12! 🎉 BINGO! +100 points!` |
| `@spmt newcard` | Generate default card (admin) | `New bingo card generated! Type "@spmt card" to see it` |
| `@spmt newcard p1\|p2\|...\|p25` | Custom 25 phrases (admin) | `New bingo card created with custom phrases!` |

## Mod/Admin Commands
| Command | Description |
|---------|-------------|
| `@spmt sleep @user` | Set someone else to away |
| `@spmt wake @user` | Clear someone's away |
| `@spmt mute` | Mute bot in this channel |
| `@spmt unmute` | Unmute bot in this channel |
| `@spmt newcard` | Generate new bingo card |
| `@spmt support [note]` | Open help ticket |
| `@spmt mod` | Show admin commands |

## Special Commands
| Command | Description |
|---------|-------------|
| `@spmt optout` | Permanently opt out channel from bot |
| `@spmt pinrank` | Pin's personal tag leaderboard |

## Pass System (NEW)
Passes let you tag someone for DOUBLE POINTS even if you're not "it".

**How to earn a pass:**
- Gift a sub in any monitored channel
- Cheer 100+ bits
- Participate in a hype train
- 1 pass per 24 hours max
- Must be a player in the game

**Usage:** `@spmt pass @username`

## Auto-Rotate Rules
| Condition | Timer | What Happens |
|-----------|-------|--------------|
| IT person is **live** and doesn't tag | 40 min | Random player becomes it (no double points exploit) |
| IT person is **offline** | 40 min | FREE FOR ALL with double points |
| FFA active, no tags | Every 60 min | Re-announces FFA reminder |
| Anyone holds it too long | 5 hours | Force random assign to someone |
| Stale state (restart/deploy) | 6+ hours | Silent reset, no broadcast |

## Automatic Behaviors
- **First-live announcement:** `🏷️ Chat Tag by MtMan1987 is active! Type "@spmt join" to play, "@spmt help" for commands.`
- **Chat activity tracking:** Any message from a player auto-clears away/sleep status and updates their "last seen" time
- **Player status:** 🟢 = live streaming, 💬 = chatting (seen in last 30 min), 😴 = sleeping/away
- **Bot joins/leaves channels** automatically based on who's live (checks every 4 min)

## Immunity Types
| Type | How Applied | How Cleared |
|------|-------------|-------------|
| Sleeping | `@spmt sleep` | `@spmt wake`, typing in chat, going live |
| Offline | Auto when IT person times out | Going live, typing in chat |
| No-tagback | Auto after being tagged | Next tag cycle |
| Timed (20 min) | Auto after tagging someone | Expires after 20 min |
