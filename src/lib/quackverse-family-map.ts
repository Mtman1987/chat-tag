export type QuackverseFamilyGroup = {
  key: string;
  label: string;
  ids: number[];
};

export const quackverseFamilyGroups: QuackverseFamilyGroup[] = [
  {
    key: 'ranger',
    label: 'Ranger / Featherbolt / Starlash',
    ids: [1, 3, 4, 5, 6, 20, 21, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80],
  },
  {
    key: 'cosmic',
    label: 'Cosmic / Nebula / Quasar / Quantum',
    ids: [2, 10, 11, 13, 15, 16, 23, 31, 35, 39, 41, 45, 49, 51, 57, 61, 65, 69, 71, 75, 77],
  },
  {
    key: 'eclipse',
    label: 'Eclipse / Void / Shadow',
    ids: [9, 17, 18, 19, 25, 29, 37, 43, 46, 53, 55, 59, 63, 66, 73, 79],
  },
  {
    key: 'solar',
    label: 'Solar / Fire',
    ids: [27, 33, 36, 42, 52, 56, 58, 62, 72, 78],
  },
  {
    key: 'lunar',
    label: 'Lunar / Ice',
    ids: [7, 8, 34, 47, 50, 60, 67, 70],
  },
  {
    key: 'weather',
    label: 'Weather / Electric',
    ids: [4, 22, 28, 32, 38, 44, 48, 54, 68, 74, 80],
  },
  {
    key: 'support',
    label: 'Support / Tech / Impact',
    ids: [7, 8, 10, 12, 13, 15, 35, 39, 41, 43, 45, 51, 57, 61, 65, 71, 75, 77],
  },
];

export function getQuackverseFamilyGroup(cardId: number) {
  return quackverseFamilyGroups.find((group) => group.ids.includes(cardId)) || null;
}
