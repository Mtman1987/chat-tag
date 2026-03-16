'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, RotateCcw } from 'lucide-react';

export function BingoGame() {
  const [phrases, setPhrases] = useState<string[]>([]);
  const [covered, setCovered] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchCard = async () => {
    const res = await fetch('/api/bingo/state');
    const data = await res.json();
    setPhrases(data.bingo?.phrases || []);
    setCovered(data.bingo?.covered || {});
  };

  useEffect(() => {
    fetchCard();
  }, []);

  const handleClaim = async (index: number) => {
    if (covered[index]) return;
    
    setLoading(true);
    const res = await fetch('/api/bingo/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'claim',
        squareIndex: index,
        userId: 'user_1',
        username: 'player1',
        avatar: '',
        streamerChannel: 'test'
      })
    });
    
    const data = await res.json();
    if (data.bingo) {
      toast({ title: '🎉 BINGO!', description: 'You got a bingo! +100 points' });
    }
    
    await fetchCard();
    setLoading(false);
  };

  const handleGenerate = async () => {
    setLoading(true);
    await fetch('/api/bingo/generate', { method: 'POST' });
    await fetchCard();
    setLoading(false);
    toast({ title: 'New card generated!' });
  };

  const handleReset = async () => {
    setLoading(true);
    await fetch('/api/bingo/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset', phrases })
    });
    await fetchCard();
    setLoading(false);
    toast({ title: 'Card reset!' });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button onClick={handleGenerate} disabled={loading}>
          <Sparkles className="mr-2 h-4 w-4" /> Generate New Card
        </Button>
        <Button onClick={handleReset} variant="outline" disabled={loading}>
          <RotateCcw className="mr-2 h-4 w-4" /> Reset
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {phrases.map((phrase, i) => (
          <Card
            key={i}
            className={`p-4 text-center cursor-pointer transition-all ${
              covered[i] ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            } ${i === 12 ? 'bg-yellow-500 text-black' : ''}`}
            onClick={() => handleClaim(i)}
          >
            <div className="text-xs font-medium">{phrase}</div>
            {covered[i] && (
              <div className="text-xs mt-1 opacity-80">{covered[i].username}</div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
