import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { dataDirPath } from '@/lib/volume-store';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ticketId = searchParams.get('id');

    if (!ticketId) {
      return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 });
    }

    const statePath = path.join(dataDirPath(), 'app-state.json');
    const stateData = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    const ticket = stateData.supportTickets?.[ticketId];

    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const content = [
      `Support Ticket #${ticketId}`,
      `=`.repeat(50),
      ``,
      `User: ${ticket.requester}`,
      `Channel: twitch.tv/${ticket.channel}`,
      `Created: ${new Date(ticket.createdAt).toLocaleString()}`,
      `Status: ${ticket.resolved ? 'Resolved' : 'Open'}`,
      ticket.resolved ? `Resolved: ${new Date(ticket.resolvedAt).toLocaleString()}` : '',
      ticket.resolvedBy ? `Resolved By: ${ticket.resolvedBy}` : '',
      ``,
      `Issue:`,
      ticket.note || 'Not specified',
      ``,
      `Game State at Time of Request:`,
      `Current It: ${ticket.itPlayer}`,
    ].filter(Boolean).join('\\n');

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="ticket-${ticketId}.txt"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
