// Test bingo grid rendering
const covered = Array(25).fill(false);
covered[1] = true;
covered[2] = true;
covered[11] = true;

const rows = [];
for (let row = 0; row < 5; row++) {
  const cells = [];
  for (let col = 0; col < 5; col++) {
    const idx = row * 5 + col;
    cells.push(covered[idx] ? 'X' : idx.toString());
  }
  rows.push('[' + cells.join('|') + ']');
}

const output = rows.join(' ');
console.log(output);
console.log('\nFull message:');
console.log(`@User Bingo Card: ${output} | Use "@spmt claim [0-24]" to mark. X=claimed`);
