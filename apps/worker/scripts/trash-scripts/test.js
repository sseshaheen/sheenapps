function add(a, b) {
  return a + b;
}

describe('add function', () => {
  test('adds 1 + 2 to equal 3', () => {
    expect(add(1, 2)).toBe(3);
  });
});

module.exports = { add };