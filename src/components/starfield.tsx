import { cn } from "@/lib/utils";

const seededRandom = (seed: number) => {
  let value = seed;

  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
};

const generateStars = (count: number, width: number, height: number, seed: number) => {
  const random = seededRandom(seed);
  let value = `${Math.floor(random() * width)}px ${Math.floor(
    random() * height
  )}px #FFF`;

  for (let i = 2; i <= count; i++) {
    value += `, ${Math.floor(random() * width)}px ${Math.floor(
      random() * height
    )}px #FFF`;
  }

  return value;
};

const stars1 = generateStars(700, 2000, 2000, 11);
const stars2 = generateStars(200, 2000, 2000, 23);
const stars3 = generateStars(100, 2000, 2000, 37);

export function Starfield() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0">
      <div className="absolute inset-0 bg-transparent">
        <div
          className="absolute h-full w-full bg-transparent"
          style={{
            height: '1px',
            width: '1px',
            background: 'transparent',
            boxShadow: stars1,
            animation: "animated-stars 200s linear infinite",
          }}
        />
        <div
          className="absolute h-full w-full"
           style={{
            height: '2px',
            width: '2px',
            background: 'transparent',
            boxShadow: stars2,
            animation: "animated-stars 150s linear infinite",
          }}
        />
        <div
          className="absolute h-full w-full"
           style={{
            height: '3px',
            width: '3px',
            background: 'transparent',
            boxShadow: stars3,
            animation: "animated-stars 100s linear infinite",
          }}
        />
      </div>
    </div>
  );
}
