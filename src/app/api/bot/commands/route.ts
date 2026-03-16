import { NextRequest, NextResponse } from 'next/server';
import { readAppState, updateAppState } from '@/lib/volume-store';

const DEFAULT_COMMANDS = [
  { name: 'join', description: 'Join the tag game', enabled: true },
  { name: 'leave', description: 'Leave the tag game', enabled: true },
  { name: 'optout', description: 'Permanently opt out and blacklist your channel', enabled: true },
  { name: 'tag @user', description: 'Tag another player', enabled: true },
  { name: 'status', description: 'Show who is currently "it"', enabled: true },
  { name: 'help', description: 'List all available commands', enabled: true },
  { name: 'mod', description: 'Mod/Broadcaster command list', enabled: true },
  { name: 'support', description: 'Mod/Broadcaster: Open support ticket', enabled: true },
  { name: 'players', description: 'Show all players in the game', enabled: true },
  { name: 'live', description: 'Show live players', enabled: true },
  { name: 'score', description: 'Show your points and rank', enabled: true },
  { name: 'rank', description: 'Show top 3 players', enabled: true },
  { name: 'stats', description: 'Show your personal tag statistics', enabled: true },
  { name: 'rules', description: 'Explain tag game rules', enabled: true },
  { name: 'info', description: 'Full game information', enabled: true },
  { name: 'mute', description: 'Mute bot in your channel', enabled: true },
  { name: 'unmute', description: 'Unmute bot in your channel', enabled: true },
  { name: 'es', description: 'Toggle Spanish mode', enabled: true },
  { name: 'fr', description: 'Toggle French mode', enabled: true },
  { name: 'set @user', description: 'Admin: Set someone as it', enabled: true },
  { name: 'reset', description: 'Admin: Reset game', enabled: true },
  { name: 'card', description: 'Show bingo card status', enabled: true },
  { name: 'claim [0-24]', description: 'Claim a bingo square', enabled: true },
  { name: 'bingo', description: 'Bingo game command', enabled: true },
];

export async function GET() {
  try {
    const state = await readAppState();
    const commands = state.settings.botCommands?.commands || DEFAULT_COMMANDS;
    return NextResponse.json({ commands });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description } = await request.json();

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Command name is required' }, { status: 400 });
    }

    const result = await updateAppState((state) => {
      const commands = state.settings.botCommands?.commands || [...DEFAULT_COMMANDS];

      if (commands.find((cmd: any) => cmd.name.toLowerCase() === name.toLowerCase())) {
        return { status: 400, error: 'Command already exists' };
      }

      const newCommand = {
        name: name.toLowerCase().trim(),
        description: description || 'Custom command',
        enabled: true,
      };

      commands.push(newCommand);
      state.settings.botCommands = { commands };
      return { command: newCommand };
    });

    if ((result as any).error) {
      return NextResponse.json({ error: (result as any).error }, { status: (result as any).status || 400 });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
